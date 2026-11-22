// C:\Users\lucas\Desktop\amigo_secreto\api\admin\participants.js
import { requireAdminAuth } from '../../lib/admin-auth.js';
import { getRedisClient } from '../../lib/redis.js';
import { normalizeName } from '../../lib/normalize-name.js';

/**
 * Handler para cadastro e listagem dos participantes.
 * Apenas acessível antes da realização do sorteio.
 *
 * @param {import('http').IncomingMessage & { body?: any }} req
 * @param {import('http').ServerResponse & { status: (code: number) => any, json: (data: any) => any }} res
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!requireAdminAuth(req, res)) {
    return;
  }

  const redis = getRedisClient();

  // Verifica se o sorteio já foi concluído
  const drawStatus = await redis.get('draw:status');
  if (drawStatus === 'done') {
    return res.status(409).json({
      error: 'O sorteio já foi realizado. A lista de participantes está bloqueada para alterações.'
    });
  }

  // GET: Recupera a lista atual de participantes cadastrados
  if (req.method === 'GET') {
    try {
      const raw = (await redis.get('participants')) || [];
      const participantsList = Array.isArray(raw)
        ? raw.map(p => (typeof p === 'string' ? p : p.name))
        : [];

      return res.status(200).json({
        participants: participantsList,
        count: participantsList.length
      });
    } catch (error) {
      console.error('[API Participants GET] Erro:', error);
      return res.status(500).json({ error: 'Erro interno ao consultar participantes.' });
    }
  }

  // POST: Cadastra ou atualiza os participantes
  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'Corpo da requisição deve ser um JSON válido.' });
        }
      }

      const { names } = body || {};

      if (!Array.isArray(names)) {
        return res.status(400).json({
          error: 'Formato inválido. O campo "names" deve ser uma lista (array) de strings.'
        });
      }

      // Validação de nomes e verificação de colisões APÓS normalização
      const normalizedMap = new Map();
      const participants = [];
      const collisions = [];

      for (const item of names) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed) continue;

        const normalized = normalizeName(trimmed);
        if (!normalized) continue;

        if (normalizedMap.has(normalized)) {
          const existing = normalizedMap.get(normalized);
          collisions.push({
            name1: existing,
            name2: trimmed,
            normalized
          });
        } else {
          normalizedMap.set(normalized, trimmed);
          participants.push({
            id: `p_${participants.length + 1}`,
            name: trimmed,
            normalized
          });
        }
      }

      // REJEITA (400) se houver qualquer colisão de nomes normalizados
      if (collisions.length > 0) {
        const col = collisions[0];
        return res.status(400).json({
          error: `Conflito de nomes após normalização: "${col.name1}" e "${col.name2}" resultam no mesmo identificador ("${col.normalized}"). Por favor, diferencie os nomes para evitar ambiguidade (ex.: "João S.", "João P.").`,
          collisions
        });
      }

      if (participants.length === 0) {
        return res.status(400).json({
          error: 'Nenhum nome válido foi informado na lista de participantes.'
        });
      }

      // Salva a lista de participantes e os índices nameindex:<normalizado> -> participantId
      const pipeline = redis.pipeline();
      pipeline.set('participants', participants);

      for (const p of participants) {
        pipeline.set(`nameindex:${p.normalized}`, p.id);
      }

      await pipeline.exec();

      const namesOnly = participants.map(p => p.name);

      return res.status(200).json({
        success: true,
        count: participants.length,
        participants: namesOnly
      });
    } catch (error) {
      console.error('[API Participants POST] Erro:', error);
      return res.status(500).json({ error: 'Erro interno ao salvar participantes.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: `Método ${req.method} não permitido.` });
}
