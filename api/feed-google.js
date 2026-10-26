// ============================================================================
// FEED DE PRODUTOS PARA O GOOGLE MERCHANT CENTER
// URL final: https://sitealiancacs.vercel.app/api/feed-google
//
// POR QUE ESTE ARQUIVO EXISTE
//   A conexão nativa Shopify <-> Merchant Center não deixa controlar duas
//   coisas que importam muito nesta loja:
//
//   1. PRAZO DE CONFECÇÃO POR PRODUTO. A política de frete do Merchant Center
//      é uma só para a loja inteira. Aqui cada item leva o prazo real:
//      aliança 10 dias úteis, caixinha e brinco 4, Akai Ito 15.
//      A regra vem de classificar(), a MESMA função que o checkout usa.
//      Se o prazo mudar, muda nos dois lugares de uma vez.
//
//   2. QUEM ENTRA NO FEED. Brindes e o produto de Personalizações ficam de
//      fora. Brinde anunciado no Shopping seria comprado sozinho, que é
//      exatamente o que a mecânica da campanha quer impedir.
//
// COMO O GOOGLE USA
//   Merchant Center -> Fontes de dados -> Adicionar produtos com um arquivo
//   -> Inserir um link para o arquivo -> cola a URL acima.
//   O Google vem buscar sozinho, uma vez por dia. Nós não empurramos nada.
//
// VARIÁVEIS DE AMBIENTE (painel da Vercel, nunca no código)
//   SHOPIFY_LOJA      aliancas-cs.myshopify.com
//   SHOPIFY_TOKEN     token do app privado, escopo read_products
//   SHOPIFY_API_VER   opcional, padrão abaixo
//   FEED_USUARIO      opcional, usuário para proteger o feed
//   FEED_SENHA        opcional, senha para proteger o feed
//
//   Se FEED_USUARIO e FEED_SENHA estiverem preenchidos, o feed passa a exigir
//   autenticação básica, e os mesmos dados vão no campo "Adicionar informações
//   de autenticação" do Merchant Center. Sem isso, o catálogo inteiro fica
//   legível por qualquer um que descubra a URL.
//
// CONFERIR
//   /api/feed-google?debug=1   devolve a contagem em JSON, sem o XML.
// ============================================================================

import { classificar } from '../lib/calculo.js';

export const maxDuration = 60;

// ----------------------------------------------------------------------------
// Configuração do feed
// ----------------------------------------------------------------------------
const LOJA_PUBLICA = 'https://aliancascs.com.br';
const MOEDA = 'BRL';
const MARCA_PADRAO = 'Alianças CS';

// Trânsito da opção GRATUITA, que é a mais lenta e a que o Merchant Center
// declara no custo de frete. Não usar prazo de SEDEX aqui: prometer data de
// SEDEX cobrando frete grátis é divergência de prazo de entrega.
const TRANSITO_MIN = 5;
const TRANSITO_MAX = 12;

// Handles que nunca entram no feed, mesmo publicados na loja.
const HANDLES_FORA = new Set([
  'personalizacoes-aliancas-cs',
]);

// ----------------------------------------------------------------------------
// Utilidades
// ----------------------------------------------------------------------------

function escapar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// O Google aceita até 5000 caracteres de descrição, em texto puro.
function textoLimpo(html, limite = 4800) {
  const t = String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > limite ? t.slice(0, limite - 3).trim() + '...' : t;
}

// gid://shopify/ProductVariant/123 -> 123
function soNumero(gid) {
  const m = String(gid || '').match(/(\d+)\s*$/);
  return m ? m[1] : '';
}

function dinheiro(valor) {
  const n = Number(valor);
  if (!isFinite(n)) { return ''; }
  return n.toFixed(2) + ' ' + MOEDA;
}

// ----------------------------------------------------------------------------
// Shopify
// ----------------------------------------------------------------------------

const CONSULTA = `
  query feed($cursor: String) {
    products(first: 50, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        vendor
        productType
        onlineStoreUrl
        descriptionHtml
        oculto: metafield(namespace: "seo", key: "hidden") { value }
        featuredImage { url }
        images(first: 6) { nodes { url } }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            availableForSale
            price
            compareAtPrice
            image { url }
          }
        }
      }
    }
  }
`;

async function buscarProdutos() {
  const loja = process.env.SHOPIFY_LOJA;
  const token = process.env.SHOPIFY_TOKEN;
  const versao = process.env.SHOPIFY_API_VER || '2026-07';

  if (!loja || !token) {
    throw new Error('Falta SHOPIFY_LOJA ou SHOPIFY_TOKEN nas variáveis de ambiente da Vercel.');
  }

  const url = `https://${loja}/admin/api/${versao}/graphql.json`;
  const todos = [];
  let cursor = null;
  let paginas = 0;

  // Trava de segurança: 40 páginas são 2000 produtos. Se um dia passar disso,
  // é melhor o feed avisar do que girar até estourar o tempo de execução.
  while (paginas < 40) {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query: CONSULTA, variables: { cursor } }),
    });

    if (!resposta.ok) {
      throw new Error(`Shopify respondeu ${resposta.status} na página ${paginas + 1}.`);
    }

    const corpo = await resposta.json();
    if (corpo.errors) {
      throw new Error('Shopify: ' + JSON.stringify(corpo.errors).slice(0, 300));
    }

    const bloco = corpo.data && corpo.data.products;
    if (!bloco) { break; }

    todos.push(...bloco.nodes);
    paginas += 1;

    if (!bloco.pageInfo.hasNextPage) { break; }
    cursor = bloco.pageInfo.endCursor;
  }

  return todos;
}

// ----------------------------------------------------------------------------
// Regras de exclusão
//
// Tudo que sai do feed sai por um motivo nomeado, para o debug conseguir
// explicar a diferença entre "926 produtos na loja" e "N itens no feed".
// ----------------------------------------------------------------------------
function motivoParaExcluir(p) {
  if (HANDLES_FORA.has(p.handle)) { return 'handle na lista de exclusão'; }
  if (!p.onlineStoreUrl) { return 'não publicado na loja virtual'; }
  if (p.oculto && String(p.oculto.value).trim() === '1') { return 'metacampo seo.hidden = 1'; }
  if (classificar(p.title).tipo === 'Brinde') { return 'é brinde'; }
  if (!p.featuredImage || !p.featuredImage.url) { return 'sem imagem'; }
  return null;
}

// ----------------------------------------------------------------------------
// Montagem dos itens
// ----------------------------------------------------------------------------
function montarItens(produtos, contagem) {
  const itens = [];

  produtos.forEach(function (p) {
    const motivo = motivoParaExcluir(p);
    if (motivo) {
      contagem.excluidos[motivo] = (contagem.excluidos[motivo] || 0) + 1;
      return;
    }

    // O prazo sai da MESMA função que o checkout usa. Não duplicar a regra.
    const info = classificar(p.title);
    const dias = info.dias;
    contagem.porPrazo[dias] = (contagem.porPrazo[dias] || 0) + 1;

    const descricao = textoLimpo(p.descriptionHtml) || p.title;
    const marca = (p.vendor || '').trim() || MARCA_PADRAO;
    const extras = (p.images && p.images.nodes ? p.images.nodes : [])
      .map(function (i) { return i.url; })
      .filter(function (u) { return u && u !== p.featuredImage.url; })
      .slice(0, 10);

    const idProduto = soNumero(p.id);
    const variantes = (p.variants && p.variants.nodes) || [];

    variantes.forEach(function (v) {
      const idVariante = soNumero(v.id);
      if (!idVariante) { return; }

      const temNome = v.title && v.title !== 'Default Title';
      const titulo = temNome ? `${p.title} - ${v.title}` : p.title;

      const preco = Number(v.price);
      const de = Number(v.compareAtPrice);
      // compareAtPrice só vira "preço cheio" se for MAIOR que o preço atual.
      const temPromocao = isFinite(de) && de > preco;

      itens.push({
        id: idVariante,
        item_group_id: variantes.length > 1 ? idProduto : '',
        title: titulo.slice(0, 150),
        description: descricao,
        link: `${LOJA_PUBLICA}/products/${p.handle}?variant=${idVariante}`,
        image_link: v.image && v.image.url ? v.image.url : p.featuredImage.url,
        additional_image_link: extras,
        availability: v.availableForSale ? 'in_stock' : 'out_of_stock',
        price: temPromocao ? dinheiro(de) : dinheiro(preco),
        sale_price: temPromocao ? dinheiro(preco) : '',
        brand: marca,
        condition: 'new',
        // Joia não tem código de barras padronizado. Sem isto o Google
        // reprova por "identificador ausente".
        identifier_exists: 'no',
        mpn: v.sku || '',
        product_type: p.productType || info.tipo,
        custom_label_0: info.tipo,
        custom_label_1: `confeccao-${dias}d`,
        min_handling_time: dias,
        max_handling_time: dias,
        min_transit_time: TRANSITO_MIN,
        max_transit_time: TRANSITO_MAX,
      });
    });
  });

  return itens;
}

// ----------------------------------------------------------------------------
// XML
// ----------------------------------------------------------------------------
function montarXml(itens) {
  const linhas = [];
  linhas.push('<?xml version="1.0" encoding="UTF-8"?>');
  linhas.push('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
  linhas.push('<channel>');
  linhas.push('<title>Alianças CS</title>');
  linhas.push(`<link>${LOJA_PUBLICA}</link>`);
  linhas.push('<description>Catálogo de joias da Alianças CS</description>');

  itens.forEach(function (it) {
    linhas.push('<item>');
    linhas.push(`<g:id>${escapar(it.id)}</g:id>`);
    if (it.item_group_id) {
      linhas.push(`<g:item_group_id>${escapar(it.item_group_id)}</g:item_group_id>`);
    }
    linhas.push(`<g:title>${escapar(it.title)}</g:title>`);
    linhas.push(`<g:description>${escapar(it.description)}</g:description>`);
    linhas.push(`<g:link>${escapar(it.link)}</g:link>`);
    linhas.push(`<g:image_link>${escapar(it.image_link)}</g:image_link>`);
    it.additional_image_link.forEach(function (u) {
      linhas.push(`<g:additional_image_link>${escapar(u)}</g:additional_image_link>`);
    });
    linhas.push(`<g:availability>${it.availability}</g:availability>`);
    linhas.push(`<g:price>${escapar(it.price)}</g:price>`);
    if (it.sale_price) {
      linhas.push(`<g:sale_price>${escapar(it.sale_price)}</g:sale_price>`);
    }
    linhas.push(`<g:brand>${escapar(it.brand)}</g:brand>`);
    linhas.push(`<g:condition>${it.condition}</g:condition>`);
    linhas.push(`<g:identifier_exists>${it.identifier_exists}</g:identifier_exists>`);
    if (it.mpn) {
      linhas.push(`<g:mpn>${escapar(it.mpn)}</g:mpn>`);
    }
    if (it.product_type) {
      linhas.push(`<g:product_type>${escapar(it.product_type)}</g:product_type>`);
    }
    linhas.push(`<g:custom_label_0>${escapar(it.custom_label_0)}</g:custom_label_0>`);
    linhas.push(`<g:custom_label_1>${escapar(it.custom_label_1)}</g:custom_label_1>`);

    // Frete grátis para todo o Brasil, igual ao que o checkout oferece.
    linhas.push('<g:shipping>');
    linhas.push('<g:country>BR</g:country>');
    linhas.push('<g:service>Frete Grátis</g:service>');
    linhas.push(`<g:price>0.00 ${MOEDA}</g:price>`);
    linhas.push('</g:shipping>');

    // É AQUI que mora a vantagem sobre a conexão nativa: prazo por produto.
    linhas.push(`<g:min_handling_time>${it.min_handling_time}</g:min_handling_time>`);
    linhas.push(`<g:max_handling_time>${it.max_handling_time}</g:max_handling_time>`);
    linhas.push(`<g:min_transit_time>${it.min_transit_time}</g:min_transit_time>`);
    linhas.push(`<g:max_transit_time>${it.max_transit_time}</g:max_transit_time>`);

    linhas.push('</item>');
  });

  linhas.push('</channel>');
  linhas.push('</rss>');
  return linhas.join('\n');
}

// ----------------------------------------------------------------------------
// Autenticação opcional
// ----------------------------------------------------------------------------
function autorizado(req) {
  const usuario = process.env.FEED_USUARIO;
  const senha = process.env.FEED_SENHA;
  if (!usuario || !senha) { return true; }

  const cabecalho = req.headers.authorization || '';
  if (!cabecalho.startsWith('Basic ')) { return false; }
  try {
    const texto = Buffer.from(cabecalho.slice(6), 'base64').toString('utf8');
    const corte = texto.indexOf(':');
    return texto.slice(0, corte) === usuario && texto.slice(corte + 1) === senha;
  } catch (e) {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Entrada
// ----------------------------------------------------------------------------
export default async function handler(req, res) {
  if (!autorizado(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="feed"');
    return res.status(401).send('Nao autorizado');
  }

  const contagem = { produtos: 0, excluidos: {}, porPrazo: {}, itens: 0 };

  try {
    const produtos = await buscarProdutos();
    contagem.produtos = produtos.length;

    const itens = montarItens(produtos, contagem);
    contagem.itens = itens.length;

    if (req.query && req.query.debug) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        produtosNaLoja: contagem.produtos,
        itensNoFeed: contagem.itens,
        excluidos: contagem.excluidos,
        itensPorPrazoDeConfeccao: contagem.porPrazo,
        exemplo: itens[0] || null,
      });
    }

    // O Google busca uma vez por dia. O cache da Vercel evita que uma visita
    // curiosa à URL dispare 19 chamadas na API da Shopify.
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).send(montarXml(itens));
  } catch (erro) {
    // Devolve 500 de propósito. Feed vazio com status 200 faria o Google
    // apagar o catálogo inteiro achando que a loja ficou sem produto.
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, erro: String(erro.message || erro) });
  }
}
