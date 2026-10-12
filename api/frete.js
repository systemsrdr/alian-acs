// ============================================================================
// ENDPOINT QUE O SHOPIFY CHAMA
// URL final: https://SEU-PROJETO.vercel.app/api/frete
//
// O token do Melhor Envio NÃO fica neste arquivo. Ele é lido da variável de
// ambiente MELHORENVIO_TOKEN, configurada no painel da Vercel.
// ============================================================================

import { lerCarrinho, cotar, montarTaxas, taxaReserva } from '../lib/calculo.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ rates: [] });
  }

  const token = process.env.MELHORENVIO_TOKEN;
  const sandbox = process.env.MELHORENVIO_SANDBOX === 'true';

  try {
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const rate = corpo?.rate;
    if (!rate?.destination?.postal_code) {
      return res.status(200).json({ rates: [] });
    }

    const { prazoConfeccao, produtos, tipoDecisivo } = lerCarrinho(rate.items);

    if (!token) {
      console.error('MELHORENVIO_TOKEN ausente. Devolvendo taxa reserva.');
      return res.status(200).json({ rates: taxaReserva(prazoConfeccao) });
    }

    const r = await cotar({
      cepDestino: rate.destination.postal_code,
      produtos, token, sandbox,
    });

    if (r.erro) {
      console.error('Cotacao falhou:', r.erro, r.detalhe || '');
      return res.status(200).json({ rates: taxaReserva(prazoConfeccao) });
    }

    const taxas = montarTaxas({ servicos: r.servicos, prazoConfeccao });
    console.log(`CEP ${rate.destination.postal_code} | confeccao ${prazoConfeccao}d (${tipoDecisivo}) | ${taxas.length} opcoes`);

    return res.status(200).json({ rates: taxas.length ? taxas : taxaReserva(prazoConfeccao) });
  } catch (e) {
    console.error('Erro inesperado:', e);
    return res.status(200).json({ rates: taxaReserva(10) });
  }
}
