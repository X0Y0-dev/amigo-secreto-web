// C:\Users\lucas\Desktop\amigo_secreto\api\draw.js
import {
  checkDrawRateLimit,
  checkCodeRateLimit,
  recordCodeFailure,
  clearCodeRateLimit
} from '../lib/rate-limit.js';
import { getRedisClient } from '../lib/redis.js';
import { normalizeCode, hashDrawCode } from '../lib/crypto.js';
import { normalizeName } from '../lib/normalize-name.js';
import { executeAtomicClaim } from '../lib/claim.js';

/**
 * Resposta genérica para código inválido ou não encontrado (Passo 1).
 */
function sendGenericInvalidCodeError(res) {
  return res.status(404).json({
    error: 'Código inválido ou não encontrado.'
  });
}

/**
 * Resposta genérica e opaca para falhas no Passo 2 (claim de nome).
 * Retorna exatamente o mesmo erro e status (400) para:
 * - Nome inexistente
 * - Nome já reivindicado anteriormente
 * - Código já utilizado/reivindicado
 * - Nome digitado não corresponde ao dono do código
 * Previne enumeração e oráculos de informação.
 */
function sendGenericConfirmationError(res) {
  return res.status(400).json({
    error: 'Não foi possível confirmar. Confira o nome e o código.'
  });
}

/**
 * Handler público do participante para consultar o resultado do seu Amigo Secreto.
 *
 * Suporta dois passos:
 * - Passo 1 ({ code }): Se unclaimed, responde apenas { needsName: true }.
 *                       Se já claimed, responde { giver, receiver }.
 * - Passo 2 ({ code, name }): Reivindica atômica e exclusivamente o sorteio para o participante.
 *
 * @param {import('http').IncomingMessage & { body?: any }} req
 * @param {import('http').ServerResponse & { status: (code: number) => any, json: (data: any) => any }} res
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Método ${req.method} não permitido.` });
  }

  // 1. Rate Limiting por IP (10 tentativas a cada 10 minutos)
  const rateLimitStatus = await checkDrawRateLimit(req);
  if (!rateLimitStatus.allowed) {
    return res.status(429).json({
      error: 'Muitas tentativas. Por favor, aguarde alguns minutos antes de tentar novamente.'
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return sendGenericInvalidCodeError(res);
      }
    }

    const { code, name } = body || {};
    if (!code || typeof code !== 'string') {
      return sendGenericInvalidCodeError(res);
    }

    // Normaliza sintaxe do código (XXXX-XXXX)
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) {
      if (name) {
        return sendGenericConfirmationError(res);
      }
      return sendGenericInvalidCodeError(res);
    }

    // 2. Rate Limiting por código (bloqueia código após 5 tentativas com erro por 15 min)
    const codeRateLimit = await checkCodeRateLimit(normalizedCode);
    if (!codeRateLimit.allowed) {
      return res.status(429).json({
        error: 'Muitas tentativas incorretas para este código. Código bloqueado temporariamente por 15 minutos.'
      });
    }

    const redis = getRedisClient();

    // Checa se o sorteio já ocorreu
    const status = await redis.get('draw:status');
    if (status !== 'done') {
      return sendGenericInvalidCodeError(res);
    }

    // Busca o resultado correspondente ao hash do código
    const pepper = process.env.CODE_PEPPER || '';
    const codeHash = hashDrawCode(normalizedCode, pepper);
    const resultKey = `result:${codeHash}`;

    let data = await redis.get(resultKey);
    if (!data) {
      if (name) {
        await recordCodeFailure(normalizedCode);
        return sendGenericConfirmationError(res);
      }
      return sendGenericInvalidCodeError(res);
    }

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // Mantém como está
      }
    }

    if (!data || !data.giver || !data.receiver) {
      return sendGenericInvalidCodeError(res);
    }

    // =========================================================================
    // PASSO 1: Somente o código foi enviado ({ code })
    // =========================================================================
    const hasName = typeof name === 'string' && name.trim().length > 0;

    if (!hasName) {
      // Se o código já foi reivindicado anteriormente (ex.: participante retornando),
      // devolve o resultado diretamente sem solicitar o nome novamente.
      if (data.claimed === true) {
        return res.status(200).json({
          giver: data.giver,
          receiver: data.receiver,
          claimed: true
        });
      }

      // Se o código ainda não foi reivindicado, retorna APENAS { needsName: true }.
      // NUNCA devolve nenhuma lista de nomes!
      return res.status(200).json({
        needsName: true
      });
    }

    // =========================================================================
    // PASSO 2: Código e nome foram enviados ({ code, name })
    // =========================================================================

    // Se o código já foi reivindicado anteriormente, rejeita tentativa de novo claim
    if (data.claimed === true) {
      await recordCodeFailure(normalizedCode);
      return sendGenericConfirmationError(res);
    }

    // Normaliza o nome informado pelo participante
    const normalizedInputName = normalizeName(name);
    if (!normalizedInputName) {
      await recordCodeFailure(normalizedCode);
      return sendGenericConfirmationError(res);
    }

    // Busca o participante no índice nameindex:<normalizado>
    const participantId = await redis.get(`nameindex:${normalizedInputName}`);
    if (!participantId) {
      // Nome inexistente
      await recordCodeFailure(normalizedCode);
      return sendGenericConfirmationError(res);
    }

    // Valida se o participante informado coincide com o dono do código sorteado
    if (data.participantId !== participantId && data.giverNormalized !== normalizedInputName) {
      // Nome não corresponde a este código
      await recordCodeFailure(normalizedCode);
      return sendGenericConfirmationError(res);
    }

    // Valida se o participante já foi reivindicado por outro código
    const alreadyClaimed = await redis.get(`claimed:participant:${participantId}`);
    if (alreadyClaimed) {
      // Nome já reivindicado
      await recordCodeFailure(normalizedCode);
      return sendGenericConfirmationError(res);
    }

    // Executa o claim atômico via Lua / operação atômica no Redis
    const claimResult = await executeAtomicClaim(redis, {
      codeHash,
      normalizedCode,
      participantId
    });

    if (!claimResult.success) {
      await recordCodeFailure(normalizedCode);
      return sendGenericConfirmationError(res);
    }

    // Sucesso: limpa eventuais erros acumulados para o código
    await clearCodeRateLimit(normalizedCode);

    // Retorna o resultado para o participante
    return res.status(200).json({
      giver: data.giver,
      receiver: data.receiver
    });
  } catch (error) {
    console.error('[API Draw POST] Erro ao processar:', error);
    return res.status(500).json({
      error: 'Erro interno no servidor ao processar a solicitação.'
    });
  }
}
