// ============================================================================
// INSTALADOR, USO ÚNICO
//
// Registra a calculadora como transportadora na Shopify, sem terminal.
// Basta abrir a URL no navegador.
//
// ----------------------------------------------------------------------------
// COMO USAR
//
// 1) Na Vercel, em Settings → Environment Variables, cria QUATRO variáveis
//    (todas do tipo Secret, Environment = Production):
//
//      SHOPIFY_LOJA            aliancas-cs.myshopify.com
//      SHOPIFY_CLIENT_ID       o "ID do cliente" do Dev Dashboard
//      SHOPIFY_CLIENT_SECRET   a "Chave secreta do cliente"
//      SETUP_CHAVE             uma senha qualquer que você inventa, ex: cs2026frete
//
// 2) Redeploy.
//
// 3) Abre no navegador, trocando SUA_SENHA pelo valor de SETUP_CHAVE:
//
//      https://sitealiancacs.vercel.app/api/instalar?chave=SUA_SENHA
//
//    Isso REGISTRA a transportadora.
//
//    Para só CONFERIR o que já existe, sem registrar nada:
//      https://sitealiancacs.vercel.app/api/instalar?chave=SUA_SENHA&acao=listar
//
//    Para REMOVER, se precisar desfazer:
//      https://sitealiancacs.vercel.app/api/instalar?chave=SUA_SENHA&acao=remover&id=123
//
// 4) Depois que der certo, APAGUE este arquivo do repositório e apague as
//    variáveis SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET e SETUP_CHAVE.
//    Elas não servem para mais nada e segredo parado é risco à toa.
// ============================================================================

const VERSAO_API = '2026-10';

async function pegarToken(loja, id, segredo) {
  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: segredo,
  });

  const r = await fetch(`https://${loja}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });

  const txt = await r.text();
  let dados;
  try { dados = JSON.parse(txt); } catch { dados = { bruto: txt.slice(0, 300) }; }

  if (!r.ok || !dados.access_token) {
    return { erro: `Shopify recusou as credenciais (HTTP ${r.status})`, detalhe: dados };
  }
  return { token: dados.access_token, escopo: dados.scope, expira_em: dados.expires_in };
}

async function shopify(loja, token, caminho, metodo = 'GET', corpo = null) {
  const r = await fetch(`https://${loja}/admin/api/${VERSAO_API}/${caminho}`, {
    method: metodo,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const txt = await r.text();
  let dados;
  try { dados = txt ? JSON.parse(txt) : {}; } catch { dados = { bruto: txt.slice(0, 500) }; }
  return { status: r.status, ok: r.ok, dados };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const loja = process.env.SHOPIFY_LOJA;
  const id = process.env.SHOPIFY_CLIENT_ID;
  const segredo = process.env.SHOPIFY_CLIENT_SECRET;
  const senha = process.env.SETUP_CHAVE;

  // --- trava simples, para ninguém de fora disparar isso ---
  if (!senha) {
    return res.status(500).json({
      erro: 'SETUP_CHAVE nao configurada na Vercel. Crie a variavel e faca redeploy.',
    });
  }
  if (req.query.chave !== senha) {
    return res.status(401).json({ erro: 'Chave invalida. Confira o ?chave= na URL.' });
  }

  const faltando = [];
  if (!loja) faltando.push('SHOPIFY_LOJA');
  if (!id) faltando.push('SHOPIFY_CLIENT_ID');
  if (!segredo) faltando.push('SHOPIFY_CLIENT_SECRET');
  if (faltando.length) {
    return res.status(500).json({
      erro: 'Faltam variaveis na Vercel',
      faltando,
      lembrete: 'Depois de criar as variaveis, e preciso fazer Redeploy.',
    });
  }

  // --- 1. token de 24h ---
  const t = await pegarToken(loja, id, segredo);
  if (t.erro) {
    return res.status(200).json({
      '1_token': 'FALHOU',
      erro: t.erro,
      detalhe: t.detalhe,
      o_que_fazer: 'Confira o ID e a chave secreta, e se o app foi instalado na loja.',
    });
  }

  const relatorio = {
    '1_token': 'ok',
    '1_escopo': t.escopo,
    '1_expira_em_segundos': t.expira_em,
  };

  if (t.escopo && !String(t.escopo).includes('write_shipping')) {
    relatorio['1_atencao'] =
      'O escopo write_shipping NAO esta no token. Volte nas configuracoes do app, '
      + 'adicione o escopo, lance uma versao nova e reinstale.';
  }

  const acao = (req.query.acao || 'registrar').toString();

  // --- 2. o que já existe ---
  const lista = await shopify(loja, t.token, 'carrier_services.json');
  const existentes = (lista.dados?.carrier_services || []).map((c) => ({
    id: c.id, nome: c.name, url: c.callback_url, ativo: c.active,
  }));
  relatorio['2_transportadoras_ja_registradas'] = existentes;

  if (acao === 'listar') {
    relatorio['3_acao'] = 'apenas listagem, nada foi alterado';
    return res.status(200).json(relatorio);
  }

  if (acao === 'remover') {
    const alvo = req.query.id;
    if (!alvo) {
      relatorio['3_erro'] = 'Informe &id=NUMERO para remover.';
      return res.status(200).json(relatorio);
    }
    const del = await shopify(loja, t.token, `carrier_services/${alvo}.json`, 'DELETE');
    relatorio['3_acao'] = del.ok ? `transportadora ${alvo} removida` : 'falha ao remover';
    relatorio['3_status'] = del.status;
    return res.status(200).json(relatorio);
  }

  // --- 3. registrar ---
  const url = `https://${req.headers.host}/api/frete`;
  const jaTem = existentes.find((c) => c.url === url);
  if (jaTem) {
    relatorio['3_acao'] = 'ja estava registrada, nada foi criado';
    relatorio['3_transportadora'] = jaTem;
    return res.status(200).json(relatorio);
  }

  const criar = await shopify(loja, t.token, 'carrier_services.json', 'POST', {
    carrier_service: {
      name: 'Alianças CS',
      callback_url: url,
      service_discovery: true,
      active: true,
    },
  });

  if (!criar.ok) {
    relatorio['3_acao'] = 'FALHOU ao registrar';
    relatorio['3_status'] = criar.status;
    relatorio['3_resposta'] = criar.dados;
    relatorio['3_o_que_fazer'] = criar.status === 422
      ? 'Normalmente e plano da loja ou transportadora duplicada. Veja a mensagem acima.'
      : 'Veja a mensagem acima.';
    return res.status(200).json(relatorio);
  }

  const c = criar.dados?.carrier_service || {};
  relatorio['3_acao'] = 'REGISTRADA COM SUCESSO';
  relatorio['3_transportadora'] = { id: c.id, nome: c.name, url: c.callback_url, ativo: c.active };
  relatorio['4_proximo_passo'] =
    'Shopify admin → Configuracoes → Envio e entrega → perfil do Campo Limpo → '
    + 'zona Brasil → Adicionar taxa → Usar transportadora → escolher "Aliancas CS". '
    + 'Ate fazer isso, nada muda para o cliente.';
  relatorio['5_limpeza'] =
    'Deu certo? Apague o arquivo api/instalar.js do repositorio e as variaveis '
    + 'SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET e SETUP_CHAVE da Vercel.';

  return res.status(200).json(relatorio);
}
