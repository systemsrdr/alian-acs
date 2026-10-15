// ============================================================================
// ALIANÇAS CS — MOTOR DO CÁLCULO
// Nada aqui precisa ser editado no dia a dia. As regras estão em config.js
// ============================================================================

import {
  CEP_ORIGEM, PRAZOS, PRAZO_PADRAO, EMBALAGENS, EMBALAGENS_BRINDE,
  UMA_CAIXA_POR_PEDIDO, CAIXA_PEDIDO, PESO_ITEM_EXTRA,
  SERVICOS, NOMES, GRATIS,
  GARANTIR_GRATIS, FOLGA_GRATIS, ENVIAR_DATAS,
  OPCOES, FERIADOS, TIMEOUT_MS, RESERVA, USER_AGENT,
} from './config.js';

const API = 'https://melhorenvio.com.br/api/v2/me/shipment/calculate';
const API_SANDBOX = 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate';

// --------------------------------------------------------------------------
// Classificação do produto pelo nome, igual à da página do produto
// --------------------------------------------------------------------------
function semAcento(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function classificar(nome) {
  const t = semAcento(nome);

  // BRINDE vem antes de tudo. Ver o bloco 3b do config.js: ele conta peso e
  // volume no frete, mas devolve dias: 0 e portanto nunca puxa o prazo de
  // confecção do carrinho.
  //
  // Depende do título começar com "Brinde". É por isso que os três produtos
  // foram cadastrados como "Brinde: Chandon...", "Brinde: Cúpula...". Um brinde
  // novo sem esse prefixo cairia em "Não identificado" e levaria o carrinho
  // inteiro para 10 dias úteis.
  if (t.startsWith('brinde')) {
    let caixa = EMBALAGENS_BRINDE.padrao;
    if (t.includes('chandon')) {
      caixa = EMBALAGENS_BRINDE.chandon;
    } else if (t.includes('cupula')) {
      caixa = EMBALAGENS_BRINDE.cupula;
    } else if (t.includes('porta-joia') || t.includes('porta joia') || t.includes('portajoia')) {
      caixa = EMBALAGENS_BRINDE.portajoias;
    }
    return { dias: 0, caixa, tipo: 'Brinde' };
  }

  const sobMedida = ['alianca', 'aliancas', 'anel', 'aneis', 'solitario', 'aparador']
    .some((k) => t.includes(k));
  const embalagem = ['caixinha', 'estojo', 'porta-joia', 'porta joia']
    .some((k) => t.includes(k));
  const conjunto = t.includes('conjunto') || t.includes('kit');

  if (t.includes('akai')) {
    return { dias: PRAZOS.akai, caixa: EMBALAGENS.aliancaAnel, tipo: 'Akai Ito' };
  }
  if (embalagem) {
    return { dias: PRAZOS.embalagem, caixa: EMBALAGENS.embalagem, tipo: 'Embalagem' };
  }
  if (sobMedida && t.includes('envio full')) {
    return { dias: PRAZOS.envioFull, caixa: EMBALAGENS.aliancaAnel, tipo: 'Envio Full' };
  }
  if (sobMedida) {
    return { dias: PRAZOS.joiaSobMedida, caixa: EMBALAGENS.aliancaAnel, tipo: 'Aliança ou anel' };
  }
  if (conjunto) {
    return { dias: PRAZOS.demais, caixa: EMBALAGENS.conjunto, tipo: 'Conjunto' };
  }
  const leve = ['brinco', 'colar', 'pulseira', 'pingente', 'corrente', 'bracelete',
    'gargantilha', 'tornozeleira', 'berloque', 'piercing'].some((k) => t.includes(k));
  if (leve) {
    return { dias: PRAZOS.demais, caixa: EMBALAGENS.joiaLeve, tipo: 'Joia leve' };
  }
  return { dias: PRAZO_PADRAO, caixa: EMBALAGENS.padrao, tipo: 'Não identificado' };
}

// --------------------------------------------------------------------------
// Dias úteis, pulando sábado, domingo e feriado nacional
// --------------------------------------------------------------------------
function chave(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export function somarUteis(base, dias) {
  const d = new Date(base.getTime());
  let faltam = dias;
  let voltas = 0;
  while (faltam > 0 && voltas < 500) {
    voltas += 1;
    d.setUTCDate(d.getUTCDate() + 1);
    const s = d.getUTCDay();
    if (s !== 0 && s !== 6 && !FERIADOS.has(chave(d))) faltam -= 1;
  }
  return d;
}

function formatarBR(d) {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Formato que o Shopify espera: "AAAA-MM-DD HH:MM:SS -0300"
function formatarShopify(d) {
  return `${chave(d)} 12:00:00 -0300`;
}

// --------------------------------------------------------------------------
// Lê o carrinho que o Shopify mandou e decide prazo e pacotes
// --------------------------------------------------------------------------
export function lerCarrinho(itens) {
  let maiorPrazo = 0;
  let tipoDecisivo = '';
  let temBrinde = false;
  let pecas = 0;        // quantidade total de itens
  let valorTotal = 0;   // em reais, para o seguro
  const porItem = [];

  for (const item of itens || []) {
    const qtd = item.quantity || 1;
    const info = classificar(item.name || item.title || '');

    if (info.dias > maiorPrazo) {
      maiorPrazo = info.dias;
      tipoDecisivo = info.tipo;
    }
    if (info.tipo === 'Brinde') temBrinde = true;

    pecas += qtd;
    valorTotal += ((item.price || 0) / 100) * qtd;

    // Peso: usa o do Shopify quando existe, senão o padrão da categoria.
    const kgShopify = (item.grams || 0) / 1000;
    const peso = kgShopify > 0.01 ? kgShopify : info.caixa.weight;

    porItem.push({
      id: String(item.variant_id || item.product_id || porItem.length + 1),
      width: info.caixa.width,
      height: info.caixa.height,
      length: info.caixa.length,
      weight: Number(peso.toFixed(3)),
      insurance_value: Number(Math.max((item.price || 0) / 100, 1).toFixed(2)),
      quantity: qtd,
    });
  }

  if (maiorPrazo === 0) maiorPrazo = PRAZO_PADRAO;

  // Modelo da cliente: o pedido inteiro numa caixa só. Ver bloco 3a do config.
  let produtos = porItem;
  if (UMA_CAIXA_POR_PEDIDO && pecas > 0) {
    const caixa = temBrinde ? CAIXA_PEDIDO.comBrinde : CAIXA_PEDIDO.semBrinde;
    const extras = Math.max(0, pecas - 1);
    produtos = [{
      id: 'pedido',
      width: caixa.width,
      height: caixa.height,
      length: caixa.length,
      weight: Number((caixa.weight + extras * PESO_ITEM_EXTRA).toFixed(3)),
      insurance_value: Number(Math.max(valorTotal, 1).toFixed(2)),
      quantity: 1,
    }];
  }

  return { prazoConfeccao: maiorPrazo, tipoDecisivo, temBrinde, produtos };
}

// --------------------------------------------------------------------------
// Consulta o Melhor Envio
// --------------------------------------------------------------------------
export async function cotar({ cepDestino, produtos, token, sandbox = false }) {
  const corpo = {
    from: { postal_code: String(CEP_ORIGEM).replace(/\D/g, '') },
    to: { postal_code: String(cepDestino).replace(/\D/g, '') },
    products: produtos,
    options: OPCOES,
    services: SERVICOS,
  };

  const corta = new AbortController();
  const timer = setTimeout(() => corta.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(sandbox ? API_SANDBOX : API, {
      method: 'POST',
      signal: corta.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(corpo),
    });
    clearTimeout(timer);

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { erro: `Melhor Envio respondeu ${r.status}`, detalhe: txt.slice(0, 400) };
    }
    const dados = await r.json();
    if (!Array.isArray(dados)) return { erro: 'Resposta inesperada do Melhor Envio' };
    return { servicos: dados };
  } catch (e) {
    clearTimeout(timer);
    const motivo = e.name === 'AbortError' ? `sem resposta em ${TIMEOUT_MS}ms` : e.message;
    return { erro: `Falha ao falar com o Melhor Envio: ${motivo}` };
  }
}

// --------------------------------------------------------------------------
// Monta a resposta final no formato do Shopify
// --------------------------------------------------------------------------
// Monta UMA opção no formato do Shopify. Separado para que a opção garantida
// lá embaixo saia exatamente igual às outras, sem texto divergente.
function montarUma({ nome, codigo, centavos, transito, prazoConfeccao, hoje }) {
  const total = prazoConfeccao + transito;
  const dataMin = somarUteis(hoje, total);
  const dataMax = somarUteis(hoje, total + 2); // folga de 2 dias úteis

  const taxa = {
    service_name: nome,
    service_code: codigo,
    total_price: String(centavos),
    currency: 'BRL',
    description:
      `Chega até ${formatarBR(dataMax)}. ` +
      `${prazoConfeccao} dias úteis de confecção mais ${transito} de transporte.`,
  };

  // Ver o bloco 4c do config.js: com as datas ligadas, o Shopify escreve a
  // própria linha "X a Y dias úteis" por cima da nossa frase.
  if (ENVIAR_DATAS) {
    taxa.min_delivery_date = formatarShopify(dataMin);
    taxa.max_delivery_date = formatarShopify(dataMax);
  }

  return taxa;
}

export function montarTaxas({ servicos, prazoConfeccao, hoje = new Date() }) {
  const taxas = [];
  let temGratis = false;
  let maiorTransito = 0;

  for (const s of servicos) {
    if (s.error || s.price == null) continue;

    const preco = Number(s.custom_price ?? s.price);
    const transito = Number(s.custom_delivery_time ?? s.delivery_time ?? 0);
    if (!Number.isFinite(preco) || !Number.isFinite(transito)) continue;

    if (transito > maiorTransito) maiorTransito = transito;

    const gratis = GRATIS.includes(Number(s.id));
    if (gratis) temGratis = true;

    taxas.push(montarUma({
      nome: NOMES[Number(s.id)] || s.name || 'Envio',
      codigo: `me-${s.id}`,
      centavos: gratis ? 0 : Math.round(preco * 100),
      transito,
      prazoConfeccao,
      hoje,
    }));
  }

  // Garantia do frete grátis. Ver o bloco 4b do config.js.
  // Só entra quando alguma opção paga saiu mas a grátis não. Se nada saiu, quem
  // resolve é a taxaReserva, lá no api/frete.js.
  if (GARANTIR_GRATIS && taxas.length > 0 && !temGratis) {
    const idGratis = GRATIS[0];
    const transito = (maiorTransito || RESERVA.diasTransito) + FOLGA_GRATIS;

    taxas.unshift(montarUma({
      nome: NOMES[idGratis] || RESERVA.nome,
      codigo: `me-${idGratis}`,
      centavos: 0,
      transito,
      prazoConfeccao,
      hoje,
    }));
  }

  return taxas;
}

// --------------------------------------------------------------------------
// Taxa reserva, para o checkout nunca ficar sem opção
// --------------------------------------------------------------------------
export function taxaReserva(prazoConfeccao, hoje = new Date()) {
  return [montarUma({
    nome: RESERVA.nome,
    codigo: RESERVA.codigo,
    centavos: 0,
    transito: RESERVA.diasTransito,
    prazoConfeccao,
    hoje,
  })];
}

export { formatarBR };
