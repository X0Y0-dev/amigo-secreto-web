// C:\Users\lucas\Desktop\amigo_secreto\lib\rate-limit.js
import { getRedisClient } from './redis.js';

// Rate limit por IP: 10 tentativas por janela de 10 minutos
const IP_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const IP_RATE_LIMIT_MAX_ATTEMPTS = 10;

// Rate limit por código: 5 tentativas erradas por código bloqueiam por 15 minutos
const CODE_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const CODE_RATE_LIMIT_MAX_ATTEMPTS = 5;

/**
 * Extrai o endereço IP do cliente considerando proxies da Vercel.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {string} Endereço IP do cliente
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const raw = typeof forwarded === 'string' ? forwarded : forwarded[0];
    const firstIp = raw.split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  return (
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

/**
 * Valida o limite de requisições no endpoint de sorteio (/api/draw) por IP.
 * Utiliza o padrão atômico do Redis (INCR + EXPIRE).
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ allowed: boolean, remaining: number, resetIn: number }>}
 */
export async function checkDrawRateLimit(req) {
  const redis = getRedisClient();
  const ip = getClientIp(req);
  const key = `ratelimit:draw:${ip}`;

  try {
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, IP_RATE_LIMIT_WINDOW_SECONDS);
    }

    if (current > IP_RATE_LIMIT_MAX_ATTEMPTS) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: IP_RATE_LIMIT_WINDOW_SECONDS
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, IP_RATE_LIMIT_MAX_ATTEMPTS - current),
      resetIn: IP_RATE_LIMIT_WINDOW_SECONDS
    };
  } catch (error) {
    console.error('[RateLimit] Erro ao checar rate limit por IP:', error);
    return {
      allowed: true,
      remaining: 1,
      resetIn: IP_RATE_LIMIT_WINDOW_SECONDS
    };
  }
}

/**
 * Verifica se um determinado código está bloqueado por excesso de tentativas incorretas.
 *
 * @param {string} normalizedCode Código no formato XXXX-XXXX
 * @returns {Promise<{ allowed: boolean, remaining: number, count: number }>}
 */
export async function checkCodeRateLimit(normalizedCode) {
  const redis = getRedisClient();
  const key = `ratelimit:code:${normalizedCode}`;

  try {
    const current = Number(await redis.get(key) || 0);

    if (current >= CODE_RATE_LIMIT_MAX_ATTEMPTS) {
      return {
        allowed: false,
        remaining: 0,
        count: current
      };
    }

    return {
      allowed: true,
      remaining: CODE_RATE_LIMIT_MAX_ATTEMPTS - current,
      count: current
    };
  } catch (error) {
    console.error('[RateLimit] Erro ao verificar rate limit por código:', error);
    return { allowed: true, remaining: 1, count: 0 };
  }
}

/**
 * Registra uma tentativa incorreta associada a um código.
 * Se atingir o limite (5 tentativas), o código fica bloqueado por 15 minutos.
 *
 * @param {string} normalizedCode Código no formato XXXX-XXXX
 * @returns {Promise<number>} Quantidade de erros registrados
 */
export async function recordCodeFailure(normalizedCode) {
  const redis = getRedisClient();
  const key = `ratelimit:code:${normalizedCode}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, CODE_RATE_LIMIT_WINDOW_SECONDS);
    }
    return current;
  } catch (error) {
    console.error('[RateLimit] Erro ao registrar falha no código:', error);
    return 1;
  }
}

/**
 * Limpa o contador de tentativas erradas de um código após sucesso.
 *
 * @param {string} normalizedCode Código no formato XXXX-XXXX
 */
export async function clearCodeRateLimit(normalizedCode) {
  const redis = getRedisClient();
  const key = `ratelimit:code:${normalizedCode}`;

  try {
    if (typeof redis.del === 'function') {
      await redis.del(key);
    }
  } catch {
    // ok
  }
}
