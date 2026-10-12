# Frete Alianças CS

Cotação em tempo real do Melhor Envio **somada ao prazo de confecção de cada
produto**, no checkout da Shopify.

Resolve o que nenhum app pronto faz: o app de frete só aceita um número único
para a loja toda, e aqui cada peça tem o seu.

```
Cliente digita o CEP no checkout
        ↓  Shopify manda o carrinho inteiro
   /api/frete
        ├─ lê os produtos e acha o MAIOR prazo de confecção (4, 10 ou 15)
        ├─ pergunta preço e prazo reais ao Melhor Envio
        └─ soma os dois, pulando fim de semana e feriado
        ↓
   SEDEX  R$ 61,40
   Chega até 29/10. 10 dias úteis de confecção mais 3 de transporte.
```

---

## O TOKEN NUNCA ENTRA NO CÓDIGO

O token do Melhor Envio é configurado como **variável de ambiente na Vercel**,
por você. Ele não está em nenhum arquivo deste projeto e não deve ser colado em
chat, e-mail nem print.

---

## Passo 1: publicar na Vercel

**Opção A, pelo terminal** (mais rápida):

```bash
npm i -g vercel
cd frete-cs
vercel          # faz perguntas, aceita tudo no padrão
vercel --prod   # publica
```

**Opção B, pelo site:** sobe esta pasta para um repositório no GitHub, entra em
vercel.com, "Add New Project", escolhe o repositório, "Deploy".

No fim você recebe uma URL, parecida com `https://frete-cs.vercel.app`.

## Passo 2: colocar o token

1. Gera o token em https://melhorenvio.com.br/painel/gerenciar/tokens
   Escopo necessário: **shipping-calculate**
2. No painel da Vercel: **Settings → Environment Variables**
3. Cria:

   | Nome | Valor |
   |---|---|
   | `MELHORENVIO_TOKEN` | o token (cola aqui, só aqui) |
   | `MELHORENVIO_SANDBOX` | `true` para testar, `false` para valer |

4. **Redeploy**, senão a variável não entra.

## Passo 3: testar no navegador, antes de tocar na loja

Abre esta URL, trocando o domínio pelo seu:

```
https://SEU-PROJETO.vercel.app/api/teste?cep=80010000&produto=Alianca%20de%20Casamento%20Classic%20Ouro%2018K
```

A resposta mostra a conta inteira, em cinco blocos:

1. o que entrou
2. como o produto foi classificado e quantos dias de confecção
3. o pacote que foi mandado ao Melhor Envio
4. o que o Melhor Envio respondeu, preço e prazo por serviço
5. **o que o cliente veria no checkout**

Testa trocando o `produto=` para ver o prazo mudar:

| Produto no teste | Prazo esperado |
|---|---|
| `Alianca de Casamento Classic Ouro 18K` | 10 dias |
| `Brinco Allegra Ouro 18K` | 4 dias |
| `Caixinha Premium Anel` | 4 dias |
| `Alianca Celestia (Envio Full)` | 4 dias |

Se o bloco 4 trouxer preço e prazo, a integração está de pé.

## Passo 4: ligar na Shopify

**4.1. Criar um app próprio na loja**

Shopify admin → Configurações → **Apps e canais de vendas** → Desenvolver apps →
Criar app. Em **Configurar escopos da Admin API**, marca `write_shipping`.
Instala e copia o token de acesso. **Esse token também não vai para chat.**

**4.2. Registrar o carrier service**

No seu terminal, trocando as duas partes em maiúsculas:

```bash
curl -X POST \
  "https://aliancas-cs.myshopify.com/admin/api/2026-01/carrier_services.json" \
  -H "X-Shopify-Access-Token: SEU_TOKEN_SHOPIFY" \
  -H "Content-Type: application/json" \
  -d '{"carrier_service":{"name":"Alianças CS","callback_url":"https://SEU-PROJETO.vercel.app/api/frete","service_discovery":true,"active":true}}'
```

**4.3. Habilitar na zona de frete**

Configurações → Envio e entrega → perfil **Shopping Campo Limpo** → zona Brasil
→ Adicionar taxa → **Usar transportadora** → escolhe **Alianças CS**.

**4.4. Taxa reserva**

Na mesma zona, deixa a taxa manual de frete grátis que já existe. É a rede de
segurança: se o Melhor Envio não responder em 6 segundos, o checkout cai nela e
a venda não se perde.

## Passo 5: conferir no checkout

Monta um carrinho com uma aliança e vai até a entrega. Tem que aparecer o preço
real e a frase com a data.

**Atenção:** o Shopify guarda a cotação em cache por **15 minutos**. Em teste,
muda alguma coisa no endereço (número do apartamento, por exemplo) a cada
tentativa, senão você vê a resposta antiga.

---

## O que mexer depois

### Medidas e pesos reais

`lib/config.js`, bloco **EMBALAGENS**. Os valores de hoje são **provisórios,
inventados para o sistema rodar**. Trocar assim que a cliente medir.

### Prazos de confecção

`lib/config.js`, bloco **PRAZOS**.

### Serviços oferecidos

`lib/config.js`, bloco **SERVICOS**. `1` é PAC, `2` é SEDEX, `17` é Mini Envios.
A lista `GRATIS` define quais aparecem com preço zero.

### Feriados

`lib/config.js`, bloco **FERIADOS**. A lista vai até o fim de 2028.

---

## O token vence a cada 30 dias

Foi isso que já derrubou o frete da loja uma vez. Quando vencer, a cotação para
e o checkout passa a mostrar só a taxa reserva. A loja continua vendendo, mas
com o frete errado.

**Põe um lembrete no calendário a cada 25 dias.** Para renovar: gera um token
novo no painel do Melhor Envio, troca o valor na Vercel e faz redeploy.

---

## Quando algo der errado

Vercel → seu projeto → **Logs**. Cada cotação deixa uma linha:

```
CEP 80010000 | confeccao 10d (Aliança ou anel) | 2 opcoes
```

Se aparecer `Cotacao falhou`, o motivo vem escrito do lado.

O endpoint **nunca devolve erro para o Shopify**. Em qualquer falha ele entrega
a taxa reserva, porque checkout sem opção de frete é venda perdida.
