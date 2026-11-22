// C:\Users\lucas\Desktop\amigo_secreto\lib\normalize-name.js

/**
 * Normaliza o nome de um participante:
 * 1. Remove espaços nas extremidades (trim)
 * 2. Colapsa espaços múltiplos em um único espaço
 * 3. Converte para minúsculas
 * 4. Remove acentos e diacríticos (decomposição NFD + remoção de \u0300-\u036f)
 *
 * Exemplo: "  JOÃO   s. " → "joao s."
 *
 * @param {string} name Nome a ser normalizado
 * @returns {string} Nome normalizado
 */
export function normalizeName(name) {
  if (typeof name !== 'string') return '';

  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
