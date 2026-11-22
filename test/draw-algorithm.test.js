// C:\Users\lucas\Desktop\amigo_secreto\test\draw-algorithm.test.js
import { generateDraw, validateDraw } from '../lib/draw-algorithm.js';
import { generateParticipantCode, normalizeCode, CODE_ALPHABET } from '../lib/crypto.js';

console.log('='.repeat(60));
console.log('🚀 INICIANDO TESTES DO ALGORITMO DE SORTEIO (AMIGO SECRETO)');
console.log('='.repeat(60));

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (!condition) {
    totalFailed++;
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  totalPassed++;
}

// ----------------------------------------------------------------------------
// Teste 1: Validação de entradas inválidas e exceções
// ----------------------------------------------------------------------------
console.log('\n[Teste 1] Testando regras de validação de participantes...');

try {
  generateDraw(['Ana', 'Beto']);
  assert(false, 'Deveria lançar erro para menos de 3 participantes.');
} catch (e) {
  assert(e.message.includes('mínimo 3 participantes'), 'Lançou erro correto para menos de 3 participantes.');
}

try {
  generateDraw(['Ana', 'Beto', 'ana']);
  assert(false, 'Deveria lançar erro para nomes duplicados (case-insensitive).');
} catch (e) {
  assert(e.message.includes('duplicado'), 'Lançou erro correto para nome duplicado.');
}

try {
  generateDraw('não é um array');
  assert(false, 'Deveria lançar erro para tipos diferentes de array.');
} catch (e) {
  assert(true, 'Lançou erro correto para tipo não-array.');
}

// ----------------------------------------------------------------------------
// Teste 2: Milhares de iterações do algoritmo de Sattolo
// ----------------------------------------------------------------------------
const testCases = [
  { size: 3, iterations: 3000, desc: 'Tamanho mínimo (3 participantes)' },
  { size: 4, iterations: 2000, desc: 'Tamanho par pequeno (4 participantes)' },
  { size: 5, iterations: 2000, desc: 'Tamanho ímpar (5 participantes)' },
  { size: 10, iterations: 1500, desc: 'Tamanho médio (10 participantes)' },
  { size: 50, iterations: 1000, desc: 'Grupo grande (50 participantes)' },
  { size: 100, iterations: 500, desc: 'Grupo muito grande (100 participantes)' }
];

let totalIterations = 0;

for (const tc of testCases) {
  console.log(`\n[Teste 2] Executando ${tc.iterations} iterações: ${tc.desc}...`);
  const names = Array.from({ length: tc.size }, (_, i) => `Participante_${i + 1}`);

  for (let it = 0; it < tc.iterations; it++) {
    totalIterations++;
    const pairs = generateDraw(names);

    // 1. O número de pares deve ser idêntico ao número de participantes
    assert(pairs.length === tc.size, `Iteração ${it}: tamanho do resultado (${pairs.length}) diferente de ${tc.size}`);

    const givers = new Set();
    const receivers = new Set();
    const map = new Map();

    for (const pair of pairs) {
      // 2. Sem pontos fixos: f(i) != i
      assert(
        pair.giver !== pair.receiver,
        `Iteração ${it}: Ponto fixo detectado! "${pair.giver}" tirou a si mesmo.`
      );

      givers.add(pair.giver);
      receivers.add(pair.receiver);
      map.set(pair.giver, pair.receiver);
    }

    // 3. Bijeção: cada pessoa doa uma vez e recebe uma vez
    assert(givers.size === tc.size, `Iteração ${it}: nem todos os participantes são doadores.`);
    assert(receivers.size === tc.size, `Iteração ${it}: nem todos os participantes são recebedores.`);

    // 4. Ciclo único (Sattolo): não permite subciclos fechados independentes
    let current = pairs[0].giver;
    let countVisited = 0;
    const visited = new Set();

    while (current && !visited.has(current)) {
      visited.add(current);
      current = map.get(current);
      countVisited++;
    }

    assert(
      countVisited === tc.size && current === pairs[0].giver,
      `Iteração ${it}: Ciclo incompleto ou subciclos disjuntos detectados!`
    );
  }
  console.log(`  ✓ ${tc.iterations} iterações concluídas com sucesso para ${tc.size} participantes.`);
}

// ----------------------------------------------------------------------------
// Teste 3: Geração de códigos e normalização
// ----------------------------------------------------------------------------
console.log('\n[Teste 3] Testando geração e validação de códigos...');

const code = generateParticipantCode();
assert(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(code), 'Formato de código válido XXXX-XXXX.');
assert(!code.includes('0') && !code.includes('O') && !code.includes('1') && !code.includes('I') && !code.includes('L'), 'Código não contém caracteres ambíguos.');

// Normalização
const normalized1 = normalizeCode(code.toLowerCase());
assert(normalized1 === code, 'Normalização de minúsculas funciona.');

const rawWithoutHyphen = code.replace('-', '').toLowerCase();
const normalized2 = normalizeCode(rawWithoutHyphen);
assert(normalized2 === code, 'Normalização sem hífen reconstrói máscara XXXX-XXXX.');

assert(normalizeCode('INVALID1') === null, 'Rejeita caracteres ambíguos (número 1).');
assert(normalizeCode('TOOLONGCODE') === null, 'Rejeita códigos com tamanho incorreto.');

// ----------------------------------------------------------------------------
// Teste 4: Normalização de nomes (lib/normalize-name.js)
// ----------------------------------------------------------------------------
console.log('\n[Teste 4] Testando normalização de nomes...');

import { normalizeName } from '../lib/normalize-name.js';

assert(normalizeName('  JOÃO   s. ') === 'joao s.', 'Exemplo da especificação: "  JOÃO   s. " → "joao s."');
assert(normalizeName('joão') === 'joao', '"joão" normaliza para "joao".');
assert(normalizeName('JOAO') === 'joao', '"JOAO" normaliza para "joao".');
assert(normalizeName(' João ') === 'joao', '" João " normaliza para "joao".');
assert(
  normalizeName('joão') === normalizeName('JOAO') && normalizeName('JOAO') === normalizeName(' João '),
  'Critério de aceite: "joão", "JOAO" e " João " resolvem para o mesmo participante.'
);
assert(normalizeName('Érika Álvares-Lúcia') === 'erika alvares-lucia', 'Remove múltiplos acentos agudos e circunflexos.');
assert(normalizeName('   Ána    Clara   ') === 'ana clara', 'Colapsa espaços múltiplos e faz trim.');

console.log('\n' + '='.repeat(60));
console.log(`🎉 TODOS OS TESTES PASSARAM COM SUCESSO!`);
console.log(`Total de verificações realizadas: ${totalPassed}`);
console.log(`Total de iterações de sorteio testadas: ${totalIterations}`);
console.log('='.repeat(60));
