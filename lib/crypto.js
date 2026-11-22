// C:\Users\lucas\Desktop\amigo_secreto\lib\crypto.js
import crypto from 'node:crypto';

// Alfabeto de 31 caracteres não ambíguos (exclui 0, O, 1, I, L).
// Usando rejection sampling para evitar viés de módulo.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Normaliza e valida um código fornecido pelo usuário.
 * Remove traços e espaços, converte para maiúsculas e valida os caracteres.
 * Retorna no formato canônico "XXXX-XXXX" se válido, ou null se inválido.
 *
 * @param {string} rawCode Código bruto informado pelo usuário
 * @returns {string|null} Código formatado ou null
 */
export function normalizeCode(rawCode) {
  if (typeof rawCode !== 'string') return null;

  const clean = rawCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length !== 8) return null;

  // Verifica se todos os caracteres pertencem ao alfabeto permitido
  for (const char of clean) {
    if (!CODE_ALPHABET.includes(char)) {
      return null;
    }
  }

  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

/**
 * Gera um código individual de 8 caracteres no formato XXXX-XXXX
 * utilizando crypto.randomBytes de forma criptograficamente segura.
 *
 * @returns {string} Código formatado XXXX-XXXX
 */
export function generateParticipantCode() {
  const chars = [];
  while (chars.length < 8) {
    // Usa crypto.randomInt para seleção uniforme sem viés em um alfabeto de 31 caracteres
    const index = crypto.randomInt(0, CODE_ALPHABET.length);
    chars.push(CODE_ALPHABET[index]);
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`;
}

/**
 * Gera uma lista de N códigos únicos, tratando colisões automaticamente.
 *
 * @param {number} count Quantidade de códigos necessários
 * @returns {string[]} Lista de códigos únicos
 */
export function generateUniqueCodes(count) {
  if (typeof count !== 'number' || count <= 0) {
    throw new Error('A quantidade de códigos deve ser um número positivo.');
  }

  const codes = new Set();
  while (codes.size < count) {
    codes.add(generateParticipantCode());
  }
  return Array.from(codes);
}

/**
 * Calcula o hash SHA-256 do código com pepper: sha256(pepper + código).
 * O código em texto puro NUNCA deve ser gravado no banco de dados.
 *
 * @param {string} code Código do participante (será normalizado)
 * @param {string} [pepper] Pepper secreto (padrão vindo de CODE_PEPPER)
 * @returns {string} Hash SHA-256 em hexadecimal
 */
export function hashDrawCode(code, pepper = process.env.CODE_PEPPER || '') {
  const normalized = normalizeCode(code);
  if (!normalized) {
    throw new Error('Código inválido fornecido para hashing.');
  }

  return crypto
    .createHash('sha256')
    .update(`${pepper}${normalized}`)
    .digest('hex');
}
