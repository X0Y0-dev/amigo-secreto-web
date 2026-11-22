// C:\Users\lucas\Desktop\amigo_secreto\api\admin\reset.js
import { requireAdminAuth } from '../../lib/admin-auth.js';
import { getRedisClient } from '../../lib/redis.js';

/**
 * Handler para resetar completamente o estado do sorteio.
 * Remove participantes, status e todos os resultados do Redis.
 * Destinado APENAS para testes — em produção, use com extrema cautela.
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
    // Estratégia 1: flushdb (limpa tudo)
    if (typeof redis.flushdb === 'function') {
      await redis.flushdb();
      return res.status(200).json({
        success: true,
        message: 'Estado do sorteio resetado com sucesso. Todos os dados foram removidos.'
      });
    }

    // Estratégia 2: scan + del (para Upstash REST que pode não ter flushdb)
    const keysToDelete = ['draw:status', 'participants'];

    // Busca chaves result:*
    if (typeof redis.scan === 'function') {
      let cursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: 'result:*', count: 100 });
        cursor = Number(nextCursor);
        keysToDelete.push(...keys);
      } while (cursor !== 0);

      // Busca chaves ratelimit:*
      cursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: 'ratelimit:*', count: 100 });
        cursor = Number(nextCursor);
        keysToDelete.push(...keys);
      } while (cursor !== 0);

      // Busca chaves nameindex:*
      cursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: 'nameindex:*', count: 100 });
        cursor = Number(nextCursor);
        keysToDelete.push(...keys);
      } while (cursor !== 0);

      // Busca chaves claimed:*
      cursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: 'claimed:*', count: 100 });
        cursor = Number(nextCursor);
        keysToDelete.push(...keys);
      } while (cursor !== 0);
    }

    if (keysToDelete.length > 0 && typeof redis.del === 'function') {
      await redis.del(...keysToDelete);
    }

    return res.status(200).json({
      success: true,
      message: 'Estado do sorteio resetado com sucesso. Todos os dados foram removidos.'
    });
  } catch (error) {
    console.error('[API Reset POST] Erro ao resetar:', error);
    return res.status(500).json({ error: 'Erro interno ao resetar o estado do sorteio.' });
  }
}
