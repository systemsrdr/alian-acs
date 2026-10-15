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
// 3a. UMA CAIXA POR PEDIDO
//
// Como a cliente descreveu em 15/10/2026: o pedido inteiro vai numa caixa só,
// e os brindes entram dentro dela junto com as alianças. Não é uma caixa por
// item, é uma caixa por pedido.
//
// Com UMA_CAIXA_POR_PEDIDO ligado, mandamos UM volume ao Melhor Envio, com as
// medidas abaixo. Desligado, volta ao modelo antigo, um volume por item, que
// era mais caro porque o Melhor Envio cobrava cada caixinha separada.
//
// >>> A ALTURA É MINHA, ELA NÃO MANDOU <<<
// Ela passou 20 x 30 e 20 x 17, que são duas medidas. Os Correios precisam de
// três. Os 6 e 10 cm abaixo são chute meu e precisam ser conferidos.
//
// >>> O PESO DE 400 g COM BRINDE É DUVIDOSO <<<
// Uma garrafa de Chandon 187ml pesa de 400 a 500 g sozinha, só o vidro mais o
// líquido. E a Cúpula é redoma de vidro com base de madeira. Os 400 g valem
// para a caixa com o porta-joias; com os outros dois o peso real é maior.
// Enquanto ela não medir, o frete de pedido com Chandon ou Cúpula sai por
// baixo, e a diferença sai do bolso dela, porque o PAC é grátis.
// ---------------------------------------------------------------------------
export const UMA_CAIXA_POR_PEDIDO = true;

export const CAIXA_PEDIDO = {
  //              comprimento  largura   altura    peso
  semBrinde:  { length: 20, width: 17, height: 6,  weight: 0.25 },
  comBrinde:  { length: 20, width: 30, height: 10, weight: 0.40 },
};

// Acréscimo por item além do primeiro. Os números dela descrevem o pedido
// típico, de um par de alianças. Sem isto, um pedido de quatro anéis seria
// cotado com o peso de um. Valor meu, conservador.
export const PESO_ITEM_EXTRA = 0.10;

// ---------------------------------------------------------------------------
// 3b. EMBALAGENS DOS BRINDES  >>> VALORES PROVISÓRIOS <<<
// Só valem quando UMA_CAIXA_POR_PEDIDO está desligado.
//
// O brinde viaja na mesma encomenda da joia, então ele conta peso e volume no
// frete. O que ele NÃO pode fazer é puxar o prazo de confecção: um carrinho de
// brincos promete 4 dias úteis e tem que continuar prometendo 4 dias depois de
// ganhar o presente. Ninguém espera o prazo PIORAR por ter ganhado algo.
//
// Quem cuida disso é a função classificar(), que devolve dias: 0 para qualquer
// item cujo título comece com "Brinde".
//
// A CÚPULA É A CRÍTICA: 1 kg sozinha, mais que o dobro de um pedido de aliança.
// Erro nela é erro direto na margem do frete grátis, que a loja absorve.
// ---------------------------------------------------------------------------
export const EMBALAGENS_BRINDE = {
  //              comprimento  largura  altura   peso
  chandon:     { length: 24,  width: 11, height: 11, weight: 0.55 },
  cupula:      { length: 26,  width: 16, height: 16, weight: 1.00 },
  portajoias:  { length: 16,  width: 13, height: 7,  weight: 0.35 },
  padrao:      { length: 20,  width: 14, height: 10, weight: 0.50 }, // brinde novo ainda sem medida
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
// 4b. GARANTIA DO FRETE GRÁTIS
//
// Regra confirmada pela cliente: PAC grátis para TODOS os estados do Brasil,
// sem valor mínimo e sem exceção de região.
//
// O Melhor Envio às vezes não cota o PAC para um CEP (restrição de área, peso,
// valor segurado). Sem isso aqui, o cliente desse CEP veria só o SEDEX pago e a
// promessa da loja seria quebrada bem na hora de pagar.
//
// Com GARANTIR_GRATIS ligado, a opção grátis é criada mesmo assim. O prazo usado
// é o do serviço mais lento que o Melhor Envio devolveu, mais a folga abaixo.
// A loja despacha pelo que estiver disponível e absorve a diferença, que é
// exatamente o que ela já faz com o PAC.
// ---------------------------------------------------------------------------
export const GARANTIR_GRATIS = true;
export const FOLGA_GRATIS = 3; // dias úteis somados, para não prometer apertado

// ---------------------------------------------------------------------------
// 4c. DATAS ESTRUTURADAS PARA O SHOPIFY
//
// Além da frase que escrevemos ("Chega até 12/11..."), o Shopify aceita dois
// campos de data: min_delivery_date e max_delivery_date. Quando mandamos esses
// campos, ele desenha POR CIMA da nossa frase uma linha própria, do tipo
// "18 a 20 dias úteis", contada do jeito dele. O resultado é a mesma informação
// escrita de duas formas diferentes na mesma opção, e os números não batem,
// porque ele conta o dia da chegada e nós não.
//
// Desligar aqui faz o checkout mostrar só a nossa frase: uma data, uma leitura.
// Era o pedido da cliente.
//
// Religar só faz sentido se um dia a loja precisar que o Shopify leia a data de
// entrega como dado, por exemplo para um app de rastreamento.
// ---------------------------------------------------------------------------
export const ENVIAR_DATAS = false;

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
// O código é o mesmo do PAC (me-1) de propósito: o Shopify só mostra serviços
// que ele já conhece, e esse ele já conhece. Um código novo poderia ser
// ignorado justamente no momento em que mais precisamos dele.
export const RESERVA = {
  nome: 'Frete Grátis',
  codigo: 'me-1',
  diasTransito: 12,
};

// ---------------------------------------------------------------------------
// 8. QUEM PODE CHAMAR /api/cotacao PELO NAVEGADOR
//
// O /api/cotacao é a calculadora da página do produto. Como ela roda no
// navegador do cliente, o endereço do site precisa estar liberado aqui, senão
// o próprio navegador bloqueia a chamada.
//
// O /api/frete do checkout NÃO passa por isto. Ele é chamado servidor a
// servidor, pelo Shopify, e não tem navegador no meio.
//
// >>> QUANDO O DOMÍNIO PRÓPRIO ENTRAR NO AR, ACRESCENTE ELE NESTA LISTA <<<
// Sem isso, a calculadora da página do produto para de funcionar no domínio
// novo e continua funcionando no endereço antigo, que é o tipo de falha que
// ninguém percebe até um cliente reclamar.
// ---------------------------------------------------------------------------
export const ORIGENS = [
  '.myshopify.com',
  // 'aliancascs.com.br',
];

// User-Agent é obrigatório na API do Melhor Envio.
export const USER_AGENT = 'Aliancas CS Shopify (corporativo@sistemaaliancascs.com.br)';
