// ============================================================================
// AUTORIZADOR, USO ÚNICO
//
// Completa a instalação do app na loja. É a peça que faltava: o Shopify manda
// o navegador de volta para cá com um código, e este arquivo troca esse código
// por um token e já registra a transportadora.
//
// ----------------------------------------------------------------------------
// ANTES DE USAR, no Dev Dashboard → Frete Alianças CS → Configurações do app,
// o campo "URL(s) de redirecionamento permitida(s)" precisa conter EXATAMENTE:
//
//     https://sitealiancacs.vercel.app/api/autorizar
//
// Salva e lança uma versão nova. Sem isso o Shopify recusa o redirecionamento.
//
// ----------------------------------------------------------------------------
// COMO USAR
//
//   https://sitealiancacs.vercel.app/api/autorizar?chave=SUA_SENHA
//
// Abre a tela de autorização do Shopify, você aprova, e ele volta para cá
// sozinho. A resposta final diz se a transportadora foi registrada.
//
// DEPOIS QUE DER CERTO: apague este arquivo, o api/instalar.js e as variáveis
// SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET e SETUP_CHAVE.
// ============================================================================

const VERSAO_API = '2026-10';
const ESCOPOS = 'write_shipping';

export default async function handler(req, res) {
  const loja = process.env.SHOPIFY_LOJA;
  const id = process.env.SHOPIFY_CLIENT_ID;
  const segredo = process.env.SHOPIFY_CLIENT_SECRET;
  const senha = process.env.SETUP_CHAVE;

  const redirect = `https://${req.headers.host}/api/autorizar`;
  const json = (c, b) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(c).json(b);
  };

  if (!senha || !loja || !id || !segredo) {
    const faltando = [];
    if (!senha) faltando.push('SETUP_CHAVE');
    if (!loja) faltando.push('SHOPIFY_LOJA');
    if (!id) faltando.push('SHOPIFY_CLIENT_ID');
    if (!segredo) faltando.push('SHOPIFY_CLIENT_SECRET');
    return json(500, { erro: 'Faltam variaveis na Vercel', faltando });
  }

  const { code, state, chave } = req.query;

  // ---------------------------------------------------------------------
  // IDA: ninguem trouxe codigo ainda, entao mandamos para o Shopify
  // ---------------------------------------------------------------------
  if (!code) {
    if (chave !== senha) {
      return json(401, { erro: 'Chave invalida. Use ?chave=SUA_SENHA' });
    }
    const url = `https://${loja}/admin/oauth/authorize`
      + `?client_id=${encodeURIComponent(id)}`
      + `&scope=${encodeURIComponent(ESCOPOS)}`
      + `&redirect_uri=${encodeURIComponent(redirect)}`
      + `&state=${encodeURIComponent(senha)}`;
    res.writeHead(302, { Location: url });
    return res.end();
  }

  // ---------------------------------------------------------------------
  // VOLTA: o Shopify devolveu um codigo
  // ---------------------------------------------------------------------
  if (state !== senha) {
    return json(401, { erro: 'State nao confere. Recomece pelo ?chave=SUA_SENHA' });
  }

  // 1. trocar o codigo por um token
  const r = await fetch(`https://${loja}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: segredo, code }),
  });
  const txt = await r.text();
  let dados;
  try { dados = JSON.parse(txt); } catch { dados = { bruto: txt.slice(0, 300) }; }

  if (!r.ok || !dados.access_token) {
    return json(200, {
      '1_instalacao': 'FALHOU',
      status: r.status,
      resposta: dados,
      o_que_fazer: 'Confira se a URL de redirecionamento no Dev Dashboard e exatamente '
        + redirect,
    });
  }

  const token = dados.access_token;
  const relatorio = {
    '1_instalacao': 'APP INSTALADO COM SUCESSO',
    '1_escopo': dados.scope,
  };

  if (dados.scope && !String(dados.scope).includes('write_shipping')) {
    relatorio['1_atencao'] = 'O escopo write_shipping nao veio. Adicione nas configuracoes '
      + 'do app, lance versao nova e repita.';
    return json(200, relatorio);
  }

  // 2. registrar a transportadora, ja que temos o token em maos
  const api = async (caminho, metodo = 'GET', corpo = null) => {
    const resp = await fetch(`https://${loja}/admin/api/${VERSAO_API}/${caminho}`, {
      method: metodo,
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const t = await resp.text();
    let d; try { d = t ? JSON.parse(t) : {}; } catch { d = { bruto: t.slice(0, 400) }; }
    return { ok: resp.ok, status: resp.status, dados: d };
  };

  const callback = `https://${req.headers.host}/api/frete`;
  const lista = await api('carrier_services.json');
  const existentes = (lista.dados?.carrier_services || []).map((c) => ({
    id: c.id, nome: c.name, url: c.callback_url, ativo: c.active,
  }));
  relatorio['2_transportadoras_existentes'] = existentes;

  const jaTem = existentes.find((c) => c.url === callback);
  if (jaTem) {
    relatorio['3_acao'] = 'ja estava registrada, nada foi criado';
    relatorio['3_transportadora'] = jaTem;
    return json(200, relatorio);
  }

  const criar = await api('carrier_services.json', 'POST', {
    carrier_service: {
      name: 'Alianças CS',
      callback_url: callback,
      service_discovery: true,
      active: true,
    },
  });

  if (!criar.ok) {
    relatorio['3_acao'] = 'FALHOU ao registrar a transportadora';
    relatorio['3_status'] = criar.status;
    relatorio['3_resposta'] = criar.dados;
    return json(200, relatorio);
  }

  const c = criar.dados?.carrier_service || {};
  relatorio['3_acao'] = 'TRANSPORTADORA REGISTRADA';
  relatorio['3_transportadora'] = { id: c.id, nome: c.name, url: c.callback_url, ativo: c.active };
  relatorio['4_proximo_passo'] =
    'Shopify admin → Configuracoes → Envio e entrega → perfil do Campo Limpo → zona Brasil '
    + '→ Adicionar taxa → Usar transportadora → "Aliancas CS". Ate fazer isso, nada muda '
    + 'para o cliente.';
  relatorio['5_limpeza'] =
    'Apague api/autorizar.js e api/instalar.js do repositorio, e as variaveis '
    + 'SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET e SETUP_CHAVE da Vercel.';

  return json(200, relatorio);
}
