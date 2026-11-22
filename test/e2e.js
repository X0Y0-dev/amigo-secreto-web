// C:\Users\lucas\Desktop\amigo_secreto\test\e2e.js
import http from 'node:http';

const BASE = 'http://localhost:3000';
const ADMIN_KEY = 'admin123';

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
  }
}

async function main() {
  console.log('\n🧪 TESTE END-TO-END — AMIGO SECRETO (Com claim por nome e normalização)\n');

  // Garante estado limpo inicial
  await request('POST', '/api/admin/reset', null, { 'x-admin-key': ADMIN_KEY });

  // =========================================================================
  // 1. Validação de nomes e recusa de duplicados após normalização
  // =========================================================================
  console.log('--- 1. Validação de nomes no admin ---');

  // Deve REJEITAR com 400 nomes que colidam após normalização (ex.: "João" e "joao")
  const rColl = await request('POST', '/api/admin/participants', {
    names: ['João', 'joao', 'Carlos']
  }, { 'x-admin-key': ADMIN_KEY });
  check(
    'Cadastro recusa (400) nomes duplicados após normalização ("João" vs "joao")',
    rColl.status === 400 && rColl.body.error.includes('Conflito de nomes após normalização')
  );

  // Deve REJEITAR com 400 nomes com acentuação ou espaços diferentes ("Ana Clara" vs "ana  clara")
  const rColl2 = await request('POST', '/api/admin/participants', {
    names: ['Ana Clara', 'ana   clara', 'Beto']
  }, { 'x-admin-key': ADMIN_KEY });
  check(
    'Cadastro recusa (400) colisão com espaços múltiplos e acentos',
    rColl2.status === 400
  );

  // Cadastro com nomes diferenciados deve ser aceito com 200
  const validNames = ['João S.', 'João P.', 'Carlos'];
  const rSave = await request('POST', '/api/admin/participants', {
    names: validNames
  }, { 'x-admin-key': ADMIN_KEY });
  check('Cadastro aceita nomes diferenciados ("João S.", "João P.", "Carlos")', rSave.status === 200 && rSave.body.count === 3);

  // =========================================================================
  // 2. Proteção de privacidade: Nenhuma rota lista participantes sem auth
  // =========================================================================
  console.log('\n--- 2. Nenhuma rota pública lista nomes dos participantes ---');
  const rPublicList = await request('GET', '/api/participants');
  check('Não existe endpoint público que liste nomes (/api/participants retorna 404)', rPublicList.status === 404);

  // =========================================================================
  // 3. Sorteio de Sattolo e geração de códigos
  // =========================================================================
  console.log('\n--- 3. Geração do sorteio ---');
  const rGen = await request('POST', '/api/admin/generate', null, { 'x-admin-key': ADMIN_KEY });
  check('Sorteio gerado com sucesso (HTTP 200)', rGen.status === 200 && rGen.body.success);
  check('Admin recebe apenas nomes e códigos, SEM resultado', rGen.body.participants.every(p => p.name && p.code && !p.receiver));

  const participantCodes = rGen.body.participants;
  const joaoS = participantCodes.find(p => p.name === 'João S.');
  const joaoP = participantCodes.find(p => p.name === 'João P.');
  const carlos = participantCodes.find(p => p.name === 'Carlos');

  // =========================================================================
  // 4. POST /api/draw — Passo 1: { code }
  // =========================================================================
  console.log('\n--- 4. POST /api/draw (Passo 1: { code }) ---');
  const rStep1 = await request('POST', '/api/draw', { code: joaoS.code });
  check('Passo 1 retorna HTTP 200', rStep1.status === 200);
  check('Passo 1 retorna { needsName: true } para código unclaimed', rStep1.body.needsName === true);
  check('Passo 1 NÃO devolve lista de nomes nem resultados', !rStep1.body.giver && !rStep1.body.receiver && !rStep1.body.participants);

  // =========================================================================
  // 5. POST /api/draw — Passo 2: { code, name } e normalização
  // =========================================================================
  console.log('\n--- 5. POST /api/draw (Passo 2: { code, name }) ---');

  // Teste: Nome inexistente -> erro genérico
  const rNonExistent = await request('POST', '/api/draw', {
    code: joaoS.code,
    name: 'Nome Fantasma Totalmente Inexistente'
  });
  check('Nome inexistente retorna 400', rNonExistent.status === 400);
  check('Mensagem de erro para nome inexistente', rNonExistent.body.error === 'Não foi possível confirmar. Confira o nome e o código.');

  // Teste: Nome de outro participante com este código -> erro genérico IDÊNTICO
  const rWrongName = await request('POST', '/api/draw', {
    code: joaoS.code,
    name: 'Carlos'
  });
  check('Nome incorreto para o código retorna 400', rWrongName.status === 400);
  check('Mensagem de erro idêntica para nome trocado', rWrongName.body.error === 'Não foi possível confirmar. Confira o nome e o código.');

  // Teste: Indistinguibilidade das respostas
  check(
    'Respostas de erro são indistinguíveis (mesmo status e mesma mensagem)',
    rNonExistent.status === rWrongName.status && rNonExistent.body.error === rWrongName.body.error
  );

  // Teste: Normalização do nome ao confirmar
  // "joão s.", "JOAO S.", "  João   S. " devem todos normalizar para o mesmo
  console.log('\n--- 6. Teste de normalização do participante ---');
  const rClaimJoaoS = await request('POST', '/api/draw', {
    code: joaoS.code,
    name: '  joão   s.  ' // Minúsculo, com acento, com espaços
  });
  check('Claim com "  joão   s.  " aceita e normaliza para "João S."', rClaimJoaoS.status === 200);
  check('Retorna giver correto ("João S.")', rClaimJoaoS.body.giver === 'João S.');
  check('Retorna amigo sorteado (receiver)', typeof rClaimJoaoS.body.receiver === 'string');
  check('Ninguém tirou a si mesmo', rClaimJoaoS.body.giver !== rClaimJoaoS.body.receiver);

  // Teste: Tentativa de re-claim do mesmo participante com outro código
  const rReclaimName = await request('POST', '/api/draw', {
    code: joaoP.code,
    name: 'JOAO S.' // Já reivindicado
  });
  check('Nome já reivindicado retorna 400', rReclaimName.status === 400);
  check(
    'Nome já reivindicado retorna a mesma resposta genérica',
    rReclaimName.body.error === 'Não foi possível confirmar. Confira o nome e o código.'
  );

  // Teste: Participante já claimed que retorna e digita só o código (Passo 1 de novo)
  const rReturner = await request('POST', '/api/draw', { code: joaoS.code });
  check('Participante que já fez claim recebe resultado direto sem needsName', rReturner.status === 200 && rReturner.body.giver === 'João S.');

  // Teste: Claim do segundo participante com maiúsculas e sem acento
  const rClaimJoaoP = await request('POST', '/api/draw', {
    code: joaoP.code,
    name: 'JOAO P.'
  });
  check('Claim com "JOAO P." funciona perfeitamente', rClaimJoaoP.status === 200 && rClaimJoaoP.body.giver === 'João P.');

  // Teste: Claim do terceiro participante com espaços
  const rClaimCarlos = await request('POST', '/api/draw', {
    code: carlos.code,
    name: ' Carlos '
  });
  check('Claim com " Carlos " funciona perfeitamente', rClaimCarlos.status === 200 && rClaimCarlos.body.giver === 'Carlos');

  // =========================================================================
  // 7. Rate limit por código após 5 erros
  // =========================================================================
  console.log('\n--- 7. Rate limit por código após 5 tentativas incorretas ---');
  // Criamos um novo sorteio de teste para isolar tentativas
  await request('POST', '/api/admin/reset', null, { 'x-admin-key': ADMIN_KEY });
  await request('POST', '/api/admin/participants', { names: ['P1', 'P2', 'P3'] }, { 'x-admin-key': ADMIN_KEY });
  const gen2 = await request('POST', '/api/admin/generate', null, { 'x-admin-key': ADMIN_KEY });
  const testCode = gen2.body.participants[0].code;

  // Realiza 4 erros consecutivos
  for (let i = 1; i <= 4; i++) {
    const rErr = await request('POST', '/api/draw', { code: testCode, name: `Errado_${i}` });
    check(`Tentativa errada ${i} retorna 400`, rErr.status === 400);
  }

  // 5º erro atinge o limite
  const rErr5 = await request('POST', '/api/draw', { code: testCode, name: 'Errado_5' });
  check('5ª tentativa errada registra falha', rErr5.status === 400 || rErr5.status === 429);

  // 6ª tentativa deve ser bloqueada por rate limit (429)
  const rBlocked = await request('POST', '/api/draw', { code: testCode, name: 'P1' });
  check(
    'Após 5 erros, código é bloqueado temporariamente (HTTP 429)',
    rBlocked.status === 429 && rBlocked.body.error.includes('bloqueado')
  );

  // =========================================================================
  // Resumo
  // =========================================================================
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ✅ ${pass} passaram   ❌ ${fail} falharam`);
  console.log('='.repeat(50));
  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('❌ Erro no teste E2E:', err);
  process.exit(1);
});
