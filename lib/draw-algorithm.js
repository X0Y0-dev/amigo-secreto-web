// C:\Users\lucas\Desktop\amigo_secreto\lib\draw-algorithm.js
import crypto from 'node:crypto';

/**
 * Valida a lista de participantes e executa o algoritmo de Sattolo
 * para gerar um sorteio de Amigo Secreto em ciclo único (derangement).
 *
 * @param {string[]} participants Lista de nomes dos participantes
 * @returns {{ giver: string, receiver: string }[]} Pares de (doador -> recebedor)
 */
export function generateDraw(participants) {
  if (!Array.isArray(participants)) {
    throw new TypeError('Participantes devem ser informados em uma lista (array).');
  }

  // Sanitização: remove espaços nas extremidades e filtra vazios
  const cleaned = participants
    .map(name => (typeof name === 'string' ? name.trim() : ''))
    .filter(name => name.length > 0);

  if (cleaned.length < 3) {
    throw new Error('O sorteio requer no mínimo 3 participantes.');
  }

  // Validação de nomes duplicados (insensível a maiúsculas/minúsculas)
  const seen = new Set();
  for (const name of cleaned) {
    const normalized = name.toLowerCase();
    if (seen.has(normalized)) {
      throw new Error(`Nome duplicado detectado: "${name}". Todos os participantes devem ter nomes únicos.`);
    }
    seen.add(normalized);
  }

  const n = cleaned.length;
  // Criamos uma cópia para aplicar a permutação cíclica de Sattolo
  const permuted = [...cleaned];

  // Algoritmo de Sattolo:
  // Para i de n - 1 descendo até 1:
  //   escolhe j aleatório tal que 0 <= j < i (estritamente menor que i)
  //   troca permuted[i] com permuted[j]
  // Isso gera uniformemente uma permutação cíclica de comprimento n sem pontos fixos.
  for (let i = n - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i);
    const temp = permuted[i];
    permuted[i] = permuted[j];
    permuted[j] = temp;
  }

  // Mapeamento: cada participante cleaned[k] doa para permuted[k]
  const pairs = cleaned.map((giver, idx) => ({
    giver,
    receiver: permuted[idx]
  }));

  // Validação explícita pós-sorteio
  validateDraw(cleaned, pairs);

  return pairs;
}

/**
 * Validação rigorosa do resultado do sorteio.
 * Garante:
 * 1. Tamanho do resultado coincide com o tamanho dos participantes.
 * 2. Ausência total de pontos fixos (f(i) != i).
 * 3. Bijeção: todos os doadores e recebedores são únicos e pertencem à lista original.
 * 4. Ciclo único: a rota de doadores forma um ciclo completo de tamanho N sem subciclos fechados (evita A <-> B).
 *
 * @param {string[]} participants Lista original de participantes
 * @param {{ giver: string, receiver: string }[]} pairs Resultado a validar
 */
export function validateDraw(participants, pairs) {
  if (!Array.isArray(pairs) || pairs.length !== participants.length) {
    throw new Error('Falha na validação do sorteio: tamanho do resultado não coincide com o número de participantes.');
  }

  const originalSet = new Set(participants.map(p => p.trim().toLowerCase()));
  const givers = new Set();
  const receivers = new Set();
  const relationMap = new Map();

  for (const pair of pairs) {
    if (!pair || typeof pair.giver !== 'string' || typeof pair.receiver !== 'string') {
      throw new Error('Falha na validação do sorteio: par inválido encontrado.');
    }

    const giver = pair.giver.trim();
    const receiver = pair.receiver.trim();
    const giverKey = giver.toLowerCase();
    const receiverKey = receiver.toLowerCase();

    // 1. Sem pontos fixos
    if (giverKey === receiverKey) {
      throw new Error(`Falha na validação do sorteio: ponto fixo detectado ("${giver}" tirou a si próprio).`);
    }

    // 2. Pertencem aos participantes
    if (!originalSet.has(giverKey)) {
      throw new Error(`Falha na validação do sorteio: doador desconhecido "${giver}".`);
    }
    if (!originalSet.has(receiverKey)) {
      throw new Error(`Falha na validação do sorteio: recebedor desconhecido "${receiver}".`);
    }

    // 3. Sem repetição de doador ou recebedor
    if (givers.has(giverKey)) {
      throw new Error(`Falha na validação do sorteio: doador repetido "${giver}".`);
    }
    if (receivers.has(receiverKey)) {
      throw new Error(`Falha na validação do sorteio: recebedor repetido "${receiver}".`);
    }

    givers.add(giverKey);
    receivers.add(receiverKey);
    relationMap.set(giverKey, receiverKey);
  }

  // Verifica se todos doam e todos recebem
  if (givers.size !== participants.length || receivers.size !== participants.length) {
    throw new Error('Falha na validação do sorteio: distribuição não é bijetora.');
  }

  // 4. Verificação de ciclo único (impede ilhas ou subciclos disjuntos do tipo A <-> B)
  const firstGiver = pairs[0].giver.trim().toLowerCase();
  let current = firstGiver;
  let visitedCount = 0;
  const visited = new Set();

  while (current && !visited.has(current)) {
    visited.add(current);
    current = relationMap.get(current);
    visitedCount++;
  }

  if (visitedCount !== participants.length || current !== firstGiver) {
    throw new Error('Falha na validação do sorteio: o resultado gerou subciclos fechados, violando o ciclo único de Sattolo.');
  }

  return true;
}
