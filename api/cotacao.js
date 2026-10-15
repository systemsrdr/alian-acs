// ============================================================================
// COTAÇÃO PARA A PÁGINA DO PRODUTO
// URL final: https://sitealiancacs.vercel.app/api/cotacao
//
// Mesma conta do checkout, mesma classificação, mesmo Melhor Envio. A diferença
// é só a porta de entrada: aqui quem chama é o navegador do cliente, com o CEP
// que ele digitou na página do produto.
//
// Isso existe para a loja ter UMA regra de prazo, não duas. Antes a página do
// produto tinha a própria tabela de dias por região, escrita na mão, e o
// checkout tinha a conta de verdade. Os dois números divergiam.
//
// EXEMPLO
//   /api/cotacao?cep=80010000&produto=Alian%C3%A7a%20Classic&preco=129990&qtd=1
//
//   preco vem em CENTAVOS, igual o Shopify manda no Liquid.
// ============================================================================

import { lerCarrinho, cotar, montarTaxas, taxaReserva } from '../lib/calculo.js';
import { ORIGENS } from '../lib/config.js';

// Libera o navegador a ler a resposta. Origem vazia é acesso direto pela barra
// de endereços, que não é requisição cruzada e portanto não precisa de CORS.
function liberarOrigem(req, res) {
  const origem = req.headers.origin || '';
  const ok = origem === '' || ORIGENS.some((o) => origem.endsWith(o));

  if (origem && ok) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
  return ok;
}

export default async function handler(req, res) {
  const ok = liberarOrigem(req, res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!ok) {
    return res.status(403).json({ ok: false, erro: 'Origem não liberada.' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, erro: 'Use GET.' });
  }

  try {
    const cep = String(req.query.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) {
      return res.status(200).json({ ok: false, erro: 'Digite um CEP com 8 números.' });
    }

    const produto = String(req.query.produto || '');
    const preco = Number(req.query.preco || 0);                       // centavos
    const qtd = Math.max(1, Math.min(10, Number(req.query.qtd || 1)));

    // Monta um "carrinho" de um item só, no mesmo formato que o Shopify manda
    // para o /api/frete. Assim a classificação é literalmente o mesmo código.
    const { prazoConfeccao, produtos, tipoDecisivo } = lerCarrinho([
      { name: produto, grams: 0, price: preco, quantity: qtd, variant_id: '1' },
    ]);

    const responder = (taxas, reserva = false) => res.status(200).json({
      ok: true,
      confeccao: prazoConfeccao,
      tipo: tipoDecisivo,
      reserva,
      opcoes: taxas.map((t) => ({
        nome: t.service_name,
        centavos: Number(t.total_price),
        descricao: t.description,
      })),
    });

    const token = process.env.MELHORENVIO_TOKEN;
    const sandbox = process.env.MELHORENVIO_SANDBOX === 'true';

    if (!token) {
      console.error('MELHORENVIO_TOKEN ausente na cotacao da pagina do produto.');
      return responder(taxaReserva(prazoConfeccao), true);
    }

    const r = await cotar({ cepDestino: cep, produtos, token, sandbox });
    if (r.erro) {
      console.error('Cotacao da pagina do produto falhou:', r.erro, r.detalhe || '');
      return responder(taxaReserva(prazoConfeccao), true);
    }

    const taxas = montarTaxas({ servicos: r.servicos, prazoConfeccao });
    console.log(`PRODUTO CEP ${cep} | confeccao ${prazoConfeccao}d (${tipoDecisivo}) | ${taxas.length} opcoes`);

    return responder(taxas.length ? taxas : taxaReserva(prazoConfeccao), !taxas.length);
  } catch (e) {
    // A página do produto nunca deve mostrar erro cru para o cliente.
    console.error('Erro inesperado na cotacao do produto:', e);
    return res.status(200).json({
      ok: false,
      erro: 'Não consegui calcular agora. Tente de novo em instantes.',
    });
  }
}
