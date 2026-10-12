// ============================================================================
// ALIANÇAS CS — CONFIGURAÇÃO DO CÁLCULO DE FRETE
//
// É AQUI que se muda qualquer regra. Nenhum outro arquivo precisa ser tocado.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. ORIGEM
// CEP de onde as encomendas saem. Hoje: Shopping Campo Limpo.
// ---------------------------------------------------------------------------
export const CEP_ORIGEM = '05777001';

// ---------------------------------------------------------------------------
// 2. PRAZOS DE CONFECÇÃO, em dias úteis
// Mesma regra que já roda na página do produto.
// ---------------------------------------------------------------------------
export const PRAZO_PADRAO = 10;

export const PRAZOS = {
  akai: 15,          // linha Akai Ito
  envioFull: 4,      // "(Envio Full)" no nome
  embalagem: 4,      // caixinha, estojo, porta-joia
  joiaSobMedida: 10, // aliança, anel, solitário, aparador
  demais: 4,         // brinco, colar, pulseira, pingente, conjunto
};

// ---------------------------------------------------------------------------
// 3. EMBALAGENS  >>> VALORES PROVISÓRIOS <<<
//
// Inventados por mim para o sistema rodar. TROCAR pelos reais assim que a
// cliente medir. Medidas da caixa JÁ PRONTA PARA POSTAR, não da joia.
//
//   cm  = centímetros   |   kg = quilos
//
// Mínimo dos Correios para caixa: 16 x 11 x 2 cm. Não colocar menos que isso.
// ---------------------------------------------------------------------------
export const EMBALAGENS = {
  //              comprimento  largura  altura   peso
  aliancaAnel:  { length: 16,  width: 11, height: 6, weight: 0.30 },
  joiaLeve:     { length: 16,  width: 11, height: 5, weight: 0.25 }, // brinco, colar, pulseira, pingente
  conjunto:     { length: 18,  width: 13, height: 8, weight: 0.45 },
  embalagem:    { length: 16,  width: 12, height: 8, weight: 0.40 }, // caixinha, estojo
  padrao:       { length: 16,  width: 11, height: 6, weight: 0.30 },
};

// ---------------------------------------------------------------------------
// 4. SERVIÇOS DO MELHOR ENVIO
// 1 = Correios PAC   2 = Correios SEDEX   17 = Correios Mini Envios
// 3 = Jadlog Package  4 = Jadlog .COM
// ---------------------------------------------------------------------------
export const SERVICOS = '1,2';

// Como cada serviço aparece para o cliente no checkout.
export const NOMES = {
  1:  'Frete Grátis',       // PAC entra como grátis
  2:  'SEDEX',
  17: 'Mini Envios',
};

// Serviços que a loja oferece de graça. O prazo continua real, só o preço zera.
export const GRATIS = [1];

// ---------------------------------------------------------------------------
// 5. ADICIONAIS do Melhor Envio
// ---------------------------------------------------------------------------
export const OPCOES = {
  receipt: false,   // aviso de recebimento
  own_hand: false,  // mão própria
};

// ---------------------------------------------------------------------------
// 6. FERIADOS NACIONAIS em dia útil, até o fim de 2028.
// Em dezembro de 2028 alguém precisa acrescentar os anos seguintes.
// ---------------------------------------------------------------------------
export const FERIADOS = new Set([
  '2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01',
  '2026-06-04','2026-09-07','2026-10-12','2026-11-02','2026-11-20','2026-12-25',
  '2027-01-01','2027-02-08','2027-02-09','2027-03-26','2027-04-21','2027-05-27',
  '2027-09-07','2027-10-12','2027-11-02','2027-11-15',
  '2028-02-28','2028-02-29','2028-04-14','2028-04-21','2028-05-01','2028-06-15',
  '2028-09-07','2028-10-12','2028-11-02','2028-11-15','2028-11-20','2028-12-25',
]);

// ---------------------------------------------------------------------------
// 7. SEGURANÇA DE OPERAÇÃO
// ---------------------------------------------------------------------------

// Tempo máximo esperando o Melhor Envio. O Shopify corta em 10s e some com a
// opção de frete, então cortamos antes para conseguir devolver algo.
export const TIMEOUT_MS = 6000;

// Se o Melhor Envio falhar, devolvemos esta opção para o checkout nunca ficar
// vazio. Preço zero e prazo folgado: a loja não perde a venda e não promete
// o que não pode cumprir.
export const RESERVA = {
  nome: 'Frete Grátis',
  codigo: 'reserva',
  diasTransito: 12,
};

// User-Agent é obrigatório na API do Melhor Envio.
export const USER_AGENT = 'Aliancas CS Shopify (corporativo@sistemaaliancascs.com.br)';
