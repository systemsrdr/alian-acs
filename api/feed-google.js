// ============================================================================
// FEED DE PRODUTOS PARA O GOOGLE MERCHANT CENTER
// URL final: https://sitealiancacs.vercel.app/api/feed-google
//
// VERSÃO 2, de 26/10/2026: SEM TOKEN
//   A primeira versão lia a API de administrador da Shopify e exigia um app
//   privado com token. O Dev Dashboard novo da Shopify não completou a
//   instalação do app, então esta versão lê o catálogo pelo endereço PÚBLICO
//   da loja, que não pede autenticação nenhuma:
//
//     https://aliancascs.com.br/products.json?limit=250&page=1
//
//   Vantagens de ter mudado:
//     - nenhuma credencial para guardar, vazar ou vencer
//     - aparecem SÓ os produtos publicados na loja virtual, que é o que o
//       Google deve anunciar de qualquer forma
//
//   O que se perdeu:
//     - o endereço público não devolve metacampo, então o filtro pelo
//       seo.hidden deixou de funcionar. No lugar entrou a TAG `sem-google`,
//       que faz o mesmo papel e é mais fácil de usar no dia a dia.
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
// COMO TIRAR UM PRODUTO DO GOOGLE SEM MEXER EM CÓDIGO
//   Põe a tag `sem-google` no produto, dentro da Shopify. Ele some do feed
//   na próxima busca do Google e continua à venda na loja normalmente.
//
// COMO O GOOGLE USA
//   Merchant Center -> Fontes de dados -> Adicionar produtos com um arquivo
//   -> Inserir um link para o arquivo -> cola a URL acima.
//   O Google vem buscar sozinho, uma vez por dia. Nós não empurramos nada.
//
// VARIÁVEIS DE AMBIENTE
//   Nenhuma obrigatória. As três do app privado (SHOPIFY_LOJA, SHOPIFY_TOKEN,
//   SHOPIFY_API_VER) não são mais usadas e podem ser apagadas da Vercel.
//
//   FEED_USUARIO e FEED_SENHA, se preenchidas, passam a exigir autenticação
//   básica no feed, e os mesmos dados vão no campo "Adicionar informações de
//   autenticação" do Merchant Center. Sem isso, o catálogo fica legível por
//   qualquer um que descubra a URL.
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
const POR_PAGINA = 250;

// Trânsito da opção GRATUITA, que é a mais lenta e a que o Merchant Center
// declara no custo de frete. Não usar prazo de SEDEX aqui: prometer data de
// SEDEX cobrando frete grátis é divergência de prazo de entrega.
const TRANSITO_MIN = 5;
const TRANSITO_MAX = 12;

// Handles que nunca entram no feed, mesmo publicados na loja.
const HANDLES_FORA = new Set([
  'personalizacoes-aliancas-cs',
]);

// A tag que a cliente pode usar para tirar qualquer produto do Google.
const TAG_FORA = 'sem-google';

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

function dinheiro(valor) {
  const n = Number(valor);
  if (!isFinite(n)) { return ''; }
  return n.toFixed(2) + ' ' + MOEDA;
}

function listaDeTags(p) {
  // products.json devolve tags como array em algumas versões e como string
  // separada por vírgula em outras. Aceita as duas.
  const cru = p.tags;
  const bruto = Array.isArray(cru) ? cru : String(cru || '').split(',');
  return bruto.map(function (t) { return String(t).trim().toLowerCase(); });
}

// ----------------------------------------------------------------------------
// Catálogo público da Shopify
// ----------------------------------------------------------------------------
async function buscarProdutos() {
  const todos = [];

  // 12 páginas de 250 são 3000 produtos. Trava de segurança para o dia em que
  // alguém cadastrar muito mais do que a gente espera.
  for (let pagina = 1; pagina <= 12; pagina += 1) {
    const url = `${LOJA_PUBLICA}/products.json?limit=${POR_PAGINA}&page=${pagina}`;
    const resposta = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!resposta.ok) {
      throw new Error(`A loja respondeu ${resposta.status} na página ${pagina}.`);
    }

    const corpo = await resposta.json();
    const lote = (corpo && corpo.products) || [];
    if (!lote.length) { break; }

    todos.push(...lote);
    if (lote.length < POR_PAGINA) { break; }
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
  if (listaDeTags(p).includes(TAG_FORA)) { return `tag ${TAG_FORA}`; }
  if (classificar(p.title).tipo === 'Brinde') { return 'é brinde'; }
  if (!p.images || !p.images.length || !p.images[0].src) { return 'sem imagem'; }
  if (!p.variants || !p.variants.length) { return 'sem variação'; }
  return null;
}

// Imagem da variação, quando ela tem uma só dela. Senão, a primeira do produto.
function imagemDaVariacao(p, v) {
  const achou = (p.images || []).find(function (img) {
    return Array.isArray(img.variant_ids) && img.variant_ids.indexOf(v.id) !== -1;
  });
  if (achou && achou.src) { return achou.src; }
  if (v.featured_image && v.featured_image.src) { return v.featured_image.src; }
  return p.images[0].src;
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

    const descricao = textoLimpo(p.body_html) || p.title;
    const marca = String(p.vendor || '').trim() || MARCA_PADRAO;
    const principal = p.images[0].src;
    const extras = p.images
      .map(function (i) { return i.src; })
      .filter(function (u) { return u && u !== principal; })
      .slice(0, 10);

    p.variants.forEach(function (v) {
      if (!v || !v.id) { return; }

      const temNome = v.title && v.title !== 'Default Title';
      const titulo = temNome ? `${p.title} - ${v.title}` : p.title;

      const preco = Number(v.price);
      const de = Number(v.compare_at_price);
      // compare_at_price só vira "preço cheio" se for MAIOR que o preço atual.
      const temPromocao = isFinite(de) && de > preco;

      itens.push({
        id: String(v.id),
        item_group_id: p.variants.length > 1 ? String(p.id) : '',
        title: titulo.slice(0, 150),
        description: descricao,
        link: `${LOJA_PUBLICA}/products/${p.handle}?variant=${v.id}`,
        image_link: imagemDaVariacao(p, v),
        additional_image_link: extras,
        availability: v.available ? 'in_stock' : 'out_of_stock',
        price: temPromocao ? dinheiro(de) : dinheiro(preco),
        sale_price: temPromocao ? dinheiro(preco) : '',
        brand: marca,
        condition: 'new',
        // Joia não tem código de barras padronizado. Sem isto o Google
        // reprova por "identificador ausente".
        identifier_exists: 'no',
        mpn: v.sku || '',
        product_type: p.product_type || info.tipo,
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
        fonte: 'products.json publico, sem token',
        produtosPublicados: contagem.produtos,
        itensNoFeed: contagem.itens,
        excluidos: contagem.excluidos,
        itensPorPrazoDeConfeccao: contagem.porPrazo,
        exemplo: itens[0] || null,
      });
    }

    // O Google busca uma vez por dia. O cache da Vercel evita que uma visita
    // curiosa à URL dispare 4 chamadas na loja.
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
