// ============================================================================
// TELA DE TESTE, para abrir no navegador
//
//   https://SEU-PROJETO.vercel.app/api/teste?cep=80010000&produto=Alianca%20Ouro%2018K
//
// Mostra a conta inteira: o que foi classificado, o que o Melhor Envio
// respondeu e o que o cliente veria no checkout.
// ============================================================================

import { lerCarrinho, cotar, montarTaxas, classificar } from '../lib/calculo.js';
import { CEP_ORIGEM } from '../lib/config.js';

export default async function handler(req, res) {
  const cep = (req.query.cep || '01310100').toString();
  const nome = (req.query.produto || 'Aliança de Casamento Classic Ouro 18K').toString();
  const preco = Number(req.query.preco || 129990); // centavos
  const token = process.env.MELHORENVIO_TOKEN;
  const sandbox = process.env.MELHORENVIO_SANDBOX === 'true';

  const itens = [{ name: nome, grams: 0, price: preco, quantity: 1, variant_id: 1 }];
  const { prazoConfeccao, produtos, tipoDecisivo } = lerCarrinho(itens);

  const saida = {
    '1_entrada': { cep_origem: CEP_ORIGEM, cep_destino: cep, produto: nome, ambiente: sandbox ? 'sandbox' : 'producao' },
    '2_classificacao': { ...classificar(nome), prazo_confeccao_dias_uteis: prazoConfeccao, categoria: tipoDecisivo },
    '3_pacote_enviado_ao_melhor_envio': produtos,
  };

  if (!token) {
    saida['4_erro'] = 'MELHORENVIO_TOKEN nao configurado na Vercel.';
    return res.status(200).json(saida);
  }

  const r = await cotar({ cepDestino: cep, produtos, token, sandbox });
  if (r.erro) {
    saida['4_erro'] = r.erro;
    saida['4_detalhe'] = r.detalhe;
    return res.status(200).json(saida);
  }

  saida['4_resposta_melhor_envio'] = r.servicos.map((s) => ({
    id: s.id, nome: s.name, preco: s.price, preco_com_desconto: s.custom_price,
    prazo_transito: s.delivery_time, prazo_custom: s.custom_delivery_time, erro: s.error,
  }));
  saida['5_o_que_o_cliente_ve'] = montarTaxas({ servicos: r.servicos, prazoConfeccao });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(saida);
}
