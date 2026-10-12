// ============================================================================
// ALIANÇAS CS — MOTOR DO CÁLCULO
// Nada aqui precisa ser editado no dia a dia. As regras estão em config.js
// ============================================================================

import {
  CEP_ORIGEM, PRAZOS, PRAZO_PADRAO, EMBALAGENS, SERVICOS, NOMES, GRATIS,
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
  const produtos = [];

  for (const item of itens || []) {
    const qtd = item.quantity || 1;
    const info = classificar(item.name || item.title || '');

    if (info.dias > maiorPrazo) {
      maiorPrazo = info.dias;
      tipoDecisivo = info.tipo;
    }

    // Peso: usa o do Shopify quando existe, senão o padrão da categoria.
    const kgShopify = (item.grams || 0) / 1000;
    const peso = kgShopify > 0.01 ? kgShopify : info.caixa.weight;

    // Valor segurado: o Shopify manda o preço unitário em centavos.
    const valor = Math.max(((item.price || 0) / 100), 1);

    produtos.push({
      id: String(item.variant_id || item.product_id || produtos.length + 1),
      width: info.caixa.width,
      height: info.caixa.height,
      length: info.caixa.length,
      weight: Number(peso.toFixed(3)),
      insurance_value: Number(valor.toFixed(2)),
      quantity: qtd,
    });
  }

  if (maiorPrazo === 0) maiorPrazo = PRAZO_PADRAO;
  return { prazoConfeccao: maiorPrazo, tipoDecisivo, produtos };
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
export function montarTaxas({ servicos, prazoConfeccao, hoje = new Date() }) {
  const taxas = [];

  for (const s of servicos) {
    if (s.error || s.price == null) continue;

    const preco = Number(s.custom_price ?? s.price);
    const transito = Number(s.custom_delivery_time ?? s.delivery_time ?? 0);
    if (!Number.isFinite(preco) || !Number.isFinite(transito)) continue;

    const total = prazoConfeccao + transito;
    const dataMin = somarUteis(hoje, total);
    const dataMax = somarUteis(hoje, total + 2); // folga de 2 dias úteis

    const gratis = GRATIS.includes(Number(s.id));
    const centavos = gratis ? 0 : Math.round(preco * 100);
    const nome = NOMES[Number(s.id)] || s.name || 'Envio';

    taxas.push({
      service_name: nome,
      service_code: `me-${s.id}`,
      total_price: String(centavos),
      currency: 'BRL',
      description:
        `Chega até ${formatarBR(dataMax)}. ` +
        `${prazoConfeccao} dias úteis de confecção mais ${transito} de transporte.`,
      min_delivery_date: formatarShopify(dataMin),
      max_delivery_date: formatarShopify(dataMax),
    });
  }

  return taxas;
}

// --------------------------------------------------------------------------
// Taxa reserva, para o checkout nunca ficar sem opção
// --------------------------------------------------------------------------
export function taxaReserva(prazoConfeccao, hoje = new Date()) {
  const total = prazoConfeccao + RESERVA.diasTransito;
  const data = somarUteis(hoje, total);
  return [{
    service_name: RESERVA.nome,
    service_code: RESERVA.codigo,
    total_price: '0',
    currency: 'BRL',
    description: `Chega até ${formatarBR(data)}.`,
    min_delivery_date: formatarShopify(data),
    max_delivery_date: formatarShopify(data),
  }];
}

export { formatarBR };
