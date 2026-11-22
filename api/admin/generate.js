// C:\Users\lucas\Desktop\amigo_secreto\api\admin\generate.js
import { requireAdminAuth } from '../../lib/admin-auth.js';
import { getRedisClient } from '../../lib/redis.js';
import { generateUniqueCodes, hashDrawCode } from '../../lib/crypto.js';
import { generateDraw, validateDraw } from '../../lib/draw-algorithm.js';
import { normalizeName } from '../../lib/normalize-name.js';

/**
 * Handler responsável por:
 * 1. Validar autorização do admin.
 * 2. Verificar participantes cadastrados (mínimo 3).
 * 3. Gerar códigos únicos (XXXX-XXXX).
 * 4. Rodar o algoritmo de Sattolo e validar ausência de pontos fixos e ciclo único.
 * 5. Garantir atomicidade com SET ... NX em 'draw:status'.
 * 6. Gravar apenas os hashes dos códigos no Redis com os resultados correspondentes
 *    inicialmente como 'claimed: false'.
 * 7. Devolver ao admin APENAS a lista com { name, code }, SEM nenhum spoiler de resultado.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse & { status: (code: number) => any, json: (data: any) => any }} res
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!requireAdminAuth(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Método ${req.method} não permitido.` });
  }

  const redis = getRedisClient();

  try {
    // 1. Checa se o sorteio já foi concluído anteriormente
    const existingStatus = await redis.get('draw:status');
    if (existingStatus === 'done') {
      return res.status(409).json({
        error: 'O sorteio já foi realizado anteriormente. Por segurança, o sorteio NUNCA é refeito.'
      });
    }

    // 2. Busca e normaliza os participantes cadastrados
    const rawParticipants = await redis.get('participants');
    if (!Array.isArray(rawParticipants) || rawParticipants.length < 3) {
      return res.status(400).json({
        error: 'É necessário ter no mínimo 3 participantes cadastrados para realizar o sorteio.'
      });
    }

    const participants = rawParticipants.map((p, idx) => {
      if (typeof p === 'object' && p !== null && p.name) {
        return {
          id: p.id || `p_${idx + 1}`,
          name: p.name,
          normalized: p.normalized || normalizeName(p.name)
        };
      }
      const strName = String(p).trim();
      return {
        id: `p_${idx + 1}`,
        name: strName,
        normalized: normalizeName(strName)
      };
    });

    const names = participants.map(p => p.name);

    // 3. Gera os códigos únicos para cada participante
    const codes = generateUniqueCodes(participants.length);

    // 4. Executa o algoritmo de Sattolo (ciclo único) e valida
    const pairs = generateDraw(names);
    validateDraw(names, pairs);

    // 5. Garante atomicidade: apenas UMA execução pode vencer a corrida (SET ... NX)
    const acquired = await redis.set('draw:status', 'done', { nx: true });
    if (!acquired) {
      return res.status(409).json({
        error: 'O sorteio já foi realizado concorrentemente por outra requisição.'
      });
    }

    // 6. Prepara a persistência segura no Redis
    const giverToReceiverMap = new Map();
    for (const pair of pairs) {
      giverToReceiverMap.set(pair.giver, pair.receiver);
    }

    const pepper = process.env.CODE_PEPPER || '';
    const pipeline = redis.pipeline();

    // Grava cada resultado associado exclusivamente ao hash SHA-256(pepper + código)
    // Inicialmente com claimed = false (aguardando o claim com o nome do participante)
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      const code = codes[i];
      const receiver = giverToReceiverMap.get(p.name);
      const codeHash = hashDrawCode(code, pepper);

      pipeline.set(`result:${codeHash}`, {
        participantId: p.id,
        giver: p.name,
        giverNormalized: p.normalized,
        receiver: receiver,
        claimed: false,
        claimedAt: null
      });

      // Garante que o nameindex esteja gravado
      pipeline.set(`nameindex:${p.normalized}`, p.id);
    }

    await pipeline.exec();

    // 7. Retorna ao admin APENAS os códigos dos participantes, SEM os resultados dos sorteados
    const participantCodes = participants.map((p, i) => ({
      name: p.name,
      code: codes[i]
    }));

    return res.status(200).json({
      success: true,
      count: participantCodes.length,
      participants: participantCodes
    });
  } catch (error) {
    console.error('[API Generate POST] Erro durante o sorteio:', error);
    return res.status(500).json({
      error: error.message || 'Erro interno ao realizar o sorteio.'
    });
  }
}
