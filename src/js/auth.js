// C:\Users\lucas\Desktop\amigo_secreto\src\js\auth.js

const CODE_STORAGE_KEY = 'amigo_secreto_code';

/**
 * Salva o código do participante no sessionStorage para reuso na mesma aba.
 *
 * @param {string} code Código do participante
 */
export function saveCode(code) {
  if (!code || typeof code !== 'string') return;
  try {
    sessionStorage.setItem(CODE_STORAGE_KEY, code.trim().toUpperCase());
  } catch {
    // sessionStorage indisponível (modo privado de alguns navegadores antigos)
  }
}

/**
 * Recupera o código salvo anteriormente no sessionStorage.
 *
 * @returns {string|null} O código salvo ou null
 */
export function getSavedCode() {
  try {
    return sessionStorage.getItem(CODE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Remove o código salvo do sessionStorage.
 */
export function clearCode() {
  try {
    sessionStorage.removeItem(CODE_STORAGE_KEY);
  } catch {
    // ok
  }
}
