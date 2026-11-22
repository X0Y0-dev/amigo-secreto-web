// C:\Users\lucas\Desktop\amigo_secreto\api\admin\status.js
import { requireAdminAuth } from '../../lib/admin-auth.js';
import { getRedisClient } from '../../lib/redis.js';

/**
 * Handler para consultar o estado do sorteio e total de participantes.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse & { status: (code: number) => any, json: (data: any) => any }} res
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!requireAdminAuth(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Método ${req.method} não permitido.` });
  }

  try {
    const redis = getRedisClient();
    const [rawStatus, rawParticipants] = await Promise.all([
      redis.get('draw:status'),
      redis.get('participants')
    ]);

    const isDone = rawStatus === 'done';
    const participantCount = Array.isArray(rawParticipants) ? rawParticipants.length : 0;

    return res.status(200).json({
      status: isDone ? 'done' : 'pending',
      participantCount
    });
  } catch (error) {
    console.error('[API Status GET] Erro:', error);
    return res.status(500).json({ error: 'Erro interno ao consultar status do sorteio.' });
  }
}
