// C:\Users\lucas\Desktop\amigo_secreto\lib\claim.js

/**
 * Script Lua para claim atômico de código e participante no Redis.
 *
 * KEYS[1]: result:<codeHash>
 * KEYS[2]: claimed:participant:<participantId>
 * KEYS[3]: ratelimit:code:<normalizedCode>
 * ARGV[1]: participantId esperado
 * ARGV[2]: timestamp atual (ISO ou epoch)
 *
 * Retornos:
 *   1  -> Sucesso (claim realizado de forma atômica)
 *  -1  -> Resultado/código não encontrado
 *  -2  -> Código já foi utilizado/reivindicado anteriormente
 *  -3  -> Participante informado não corresponde ao dono deste código
 *  -4  -> Participante já foi reivindicado anteriormente por outro código
 */
export const CLAIM_LUA_SCRIPT = `
local resultRaw = redis.call('GET', KEYS[1])
if not resultRaw then
  return -1
end

local result
if type(resultRaw) == 'string' and string.sub(resultRaw, 1, 1) == '{' then
  result = cjson.decode(resultRaw)
else
  result = resultRaw
end

if result.claimed == true then
  return -2
end

if result.participantId ~= ARGV[1] then
  return -3
end

local claimedOk = redis.call('SET', KEYS[2], '1', 'NX')
if not claimedOk then
  return -4
end

result.claimed = true
result.claimedAt = ARGV[2]

redis.call('SET', KEYS[1], cjson.encode(result))
redis.call('DEL', KEYS[3])

return 1
`;

/**
 * Executa o claim atômico utilizando o script Lua no Redis (ou fallback atômico em JS).
 *
 * @param {object} redis Cliente Redis
 * @param {object} params
 * @param {string} params.codeHash Hash do código
 * @param {string} params.normalizedCode Código normalizado
 * @param {string} params.participantId ID do participante
 * @returns {Promise<{ success: boolean, code: number }>}
 */
export async function executeAtomicClaim(redis, { codeHash, normalizedCode, participantId }) {
  const resultKey = `result:${codeHash}`;
  const claimedKey = `claimed:participant:${participantId}`;
  const rateLimitCodeKey = `ratelimit:code:${normalizedCode}`;
  const now = Date.now().toString();

  // Tenta executar via script Lua (suportado por Upstash Redis)
  if (typeof redis.eval === 'function') {
    try {
      const res = await redis.eval(
        CLAIM_LUA_SCRIPT,
        [resultKey, claimedKey, rateLimitCodeKey],
        [participantId, now]
      );
      const code = Number(res);
      return { success: code === 1, code };
    } catch (evalErr) {
      console.warn('[Claim] Falha ao rodar Lua script via redis.eval, aplicando fallback JS:', evalErr.message);
    }
  }

  // Fallback atômico em JavaScript
  const rawData = await redis.get(resultKey);
  if (!rawData) {
    return { success: false, code: -1 };
  }

  const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

  if (data.claimed === true) {
    return { success: false, code: -2 };
  }

  if (data.participantId !== participantId) {
    return { success: false, code: -3 };
  }

  // Atomic set NX no participante
  const lock = await redis.set(claimedKey, '1', { nx: true });
  if (!lock) {
    return { success: false, code: -4 };
  }

  data.claimed = true;
  data.claimedAt = Date.now();
  await redis.set(resultKey, data);

  // Limpa contador de tentativas do código
  if (typeof redis.del === 'function') {
    await redis.del(rateLimitCodeKey);
  }

  return { success: true, code: 1 };
}
