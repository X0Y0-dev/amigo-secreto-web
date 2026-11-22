// C:\Users\lucas\Desktop\amigo_secreto\lib\admin-auth.js
import crypto from 'node:crypto';

/**
 * Valida a autenticação do administrador comparando o cabeçalho 'x-admin-key'
 * com a variável de ambiente ADMIN_KEY em tempo constante (timingSafeEqual).
 *
 * O uso de SHA-256 prévio garante que ambos os buffers tenham exatamente 32 bytes,
 * prevenindo exceções de tamanho diferente e eliminando vazamento de informação
 * sobre o comprimento da chave secreta.
 *
 * @param {import('http').IncomingMessage} req Objeto da requisição HTTP
 * @returns {boolean} True se a chave for válida, False caso contrário
 */
export function isAdminAuthorized(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || typeof adminKey !== 'string') {
    console.error('[AdminAuth] ADMIN_KEY não está configurada no ambiente.');
    return false;
  }

  // Node.js converte cabeçalhos para minúsculas automaticamente
  const providedKey = req.headers['x-admin-key'];
  if (!providedKey || typeof providedKey !== 'string') {
    return false;
  }

  try {
    const expectedHash = crypto.createHash('sha256').update(adminKey).digest();
    const providedHash = crypto.createHash('sha256').update(providedKey).digest();

    return crypto.timingSafeEqual(expectedHash, providedHash);
  } catch (error) {
    console.error('[AdminAuth] Erro ao comparar chaves em tempo constante:', error);
    return false;
  }
}

/**
 * Middleware auxiliar para rotas administrativas.
 * Se a requisição não estiver autenticada, responde com 401 e encerra.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} True se autorizado, False se respondeu 401
 */
export function requireAdminAuth(req, res) {
  if (!isAdminAuthorized(req)) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(401).json({ error: 'Acesso não autorizado. Chave de administrador inválida ou ausente.' });
    return false;
  }
  return true;
}
