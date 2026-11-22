// C:\Users\lucas\Desktop\amigo_secreto\src\js\api.js

/**
 * Função utilitária para tratar respostas da API.
 */
async function handleResponse(response) {
  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMsg = data?.error || `Erro HTTP ${response.status}: ${response.statusText}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * Consulta o resultado do amigo secreto para o código informado.
 * Rota pública protegida por rate limit.
 *
 * @param {string} code Código no formato XXXX-XXXX
 * @returns {Promise<{ giver: string, receiver: string }>}
 */
/**
 * Consulta ou confirma o resultado do amigo secreto.
 * - Passo 1: envia apenas code ({ code }) -> retorna { needsName: true } ou { giver, receiver }
 * - Passo 2: envia code e name ({ code, name }) -> realiza o claim e retorna { giver, receiver }
 *
 * @param {string} code Código no formato XXXX-XXXX
 * @param {string} [name] Nome do participante para claim
 * @returns {Promise<{ giver?: string, receiver?: string, needsName?: boolean }>}
 */
export async function fetchDrawResult(code, name) {
  const payload = { code };
  if (typeof name === 'string' && name.trim().length > 0) {
    payload.name = name.trim();
  }

  const response = await fetch('/api/draw', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return handleResponse(response);
}

/**
 * Consulta o status atual do sorteio e contagem de participantes.
 *
 * @param {string} adminKey Chave de administrador
 * @returns {Promise<{ status: 'pending'|'done', participantCount: number }>}
 */
export async function fetchAdminStatus(adminKey) {
  const response = await fetch('/api/admin/status', {
    method: 'GET',
    headers: {
      'x-admin-key': adminKey
    }
  });

  return handleResponse(response);
}

/**
 * Cadastra ou atualiza a lista de participantes antes do sorteio.
 *
 * @param {string} adminKey Chave de administrador
 * @param {string[]} names Lista de nomes
 * @returns {Promise<{ success: boolean, count: number, participants: string[] }>}
 */
export async function saveParticipants(adminKey, names) {
  const response = await fetch('/api/admin/participants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey
    },
    body: JSON.stringify({ names })
  });

  return handleResponse(response);
}

/**
 * Obtém a lista atual de participantes cadastrados.
 *
 * @param {string} adminKey Chave de administrador
 * @returns {Promise<{ count: number, participants: string[] }>}
 */
export async function fetchParticipants(adminKey) {
  const response = await fetch('/api/admin/participants', {
    method: 'GET',
    headers: {
      'x-admin-key': adminKey
    }
  });

  return handleResponse(response);
}

/**
 * Executa o sorteio final, grava os resultados no Redis e retorna apenas os códigos.
 *
 * @param {string} adminKey Chave de administrador
 * @returns {Promise<{ success: boolean, count: number, participants: { name: string, code: string }[] }>}
 */
export async function generateDraw(adminKey) {
  const response = await fetch('/api/admin/generate', {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey
    }
  });

  return handleResponse(response);
}

/**
 * Reseta completamente o estado do sorteio (participantes, resultados, status).
 * Destinado apenas para testes.
 *
 * @param {string} adminKey Chave de administrador
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function resetDraw(adminKey) {
  const response = await fetch('/api/admin/reset', {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey
    }
  });

  return handleResponse(response);
}
