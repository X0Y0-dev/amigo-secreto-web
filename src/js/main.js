// C:\Users\lucas\Desktop\amigo_secreto\src\js\main.js
import { fetchDrawResult } from './api.js';
import { saveCode, getSavedCode, clearCode } from './auth.js';

let currentCode = '';
let currentName = '';

/**
 * Inicialização dos controles e fluxo de telas para o participante.
 */
function init() {
  // Telas
  const stepCodeSection = document.getElementById('step-code-section');
  const stepNameSection = document.getElementById('step-name-section');
  const stepConfirmSection = document.getElementById('step-confirm-section');
  const resultSection = document.getElementById('result-section');
  const pageSubtitle = document.getElementById('page-subtitle');

  // Elementos da Tela 1 (Código)
  const codeInput = document.getElementById('code-input');
  const codeSubmitBtn = document.getElementById('code-submit-btn');
  const codeStatusMessage = document.getElementById('code-status-message');

  // Elementos da Tela 2 (Nome)
  const nameInput = document.getElementById('name-input');
  const nameSubmitBtn = document.getElementById('name-submit-btn');
  const nameBackBtn = document.getElementById('name-back-btn');
  const nameStatusMessage = document.getElementById('name-status-message');

  // Elementos da Tela 3 (Confirmação)
  const confirmNameDisplay = document.getElementById('confirm-name-display');
  const confirmYesBtn = document.getElementById('confirm-yes-btn');
  const confirmBackBtn = document.getElementById('confirm-back-btn');
  const confirmStatusMessage = document.getElementById('confirm-status-message');

  // Elementos da Tela 4 (Resultado)
  const giverName = document.getElementById('giver-name');
  const receiverName = document.getElementById('receiver-name');
  const newCodeBtn = document.getElementById('new-code-btn');

  // =========================================================================
  // NAVEGAÇÃO ENTRE TELAS
  // =========================================================================

  function showScreen(screen) {
    stepCodeSection.classList.add('hidden');
    stepNameSection.classList.add('hidden');
    stepConfirmSection.classList.add('hidden');
    resultSection.classList.add('hidden');

    screen.classList.remove('hidden');
  }

  function goToStep1() {
    showScreen(stepCodeSection);
    pageSubtitle.textContent = 'Descubra quem você tirou! Informe seu código abaixo.';
    codeStatusMessage.className = 'status-message';
    codeStatusMessage.textContent = '';
    codeInput.disabled = false;
    codeInput.focus();
    codeSubmitBtn.disabled = codeInput.value.replace(/-/g, '').length !== 8;
    codeSubmitBtn.textContent = '🎁 Continuar';
  }

  function goToStep2() {
    showScreen(stepNameSection);
    pageSubtitle.textContent = 'Identifique-se com o nome cadastrado no sorteio.';
    nameStatusMessage.className = 'status-message';
    nameStatusMessage.textContent = '';
    nameInput.disabled = false;
    nameInput.value = currentName || '';
    nameInput.focus();
    nameSubmitBtn.disabled = nameInput.value.trim().length === 0;
  }

  function goToStep3(nameToConfirm) {
    showScreen(stepConfirmSection);
    pageSubtitle.textContent = 'Confirmação definitiva de identidade.';
    confirmStatusMessage.className = 'status-message';
    confirmStatusMessage.textContent = '';
    // Renderizado obrigatoriamente com textContent por segurança
    confirmNameDisplay.textContent = nameToConfirm;
    confirmYesBtn.disabled = false;
    confirmYesBtn.textContent = '✅ Sim, sou eu!';
  }

  function goToStep4(result) {
    showScreen(resultSection);
    pageSubtitle.textContent = 'Aqui está o seu amigo secreto!';
    giverName.textContent = result.giver;
    receiverName.textContent = result.receiver;

    resultSection.classList.remove('reveal-animate');
    void resultSection.offsetWidth; // force reflow
    resultSection.classList.add('reveal-animate');

    saveCode(currentCode);
  }

  // =========================================================================
  // TELA 1: CÓDIGO
  // =========================================================================

  // Máscara e auto-uppercase no código (XXXX-XXXX)
  codeInput.addEventListener('input', () => {
    let raw = codeInput.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (raw.length > 8) raw = raw.slice(0, 8);
    if (raw.length > 4) {
      codeInput.value = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    } else {
      codeInput.value = raw;
    }
    codeSubmitBtn.disabled = raw.length !== 8;
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !codeSubmitBtn.disabled) {
      e.preventDefault();
      codeSubmitBtn.click();
    }
  });

  codeSubmitBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (code.replace(/-/g, '').length !== 8) return;

    codeSubmitBtn.disabled = true;
    codeSubmitBtn.textContent = 'Verificando...';
    codeInput.disabled = true;
    codeStatusMessage.className = 'status-message loading';
    codeStatusMessage.textContent = '🔍 Verificando código...';

    try {
      const response = await fetchDrawResult(code);
      currentCode = code;

      // Se o código ainda não foi reivindicado, passa para a Tela 2 (Nome)
      if (response.needsName) {
        goToStep2();
        return;
      }

      // Se já foi reivindicado anteriormente (retorno do participante), mostra resultado
      if (response.giver && response.receiver) {
        goToStep4(response);
      }
    } catch (error) {
      codeInput.disabled = false;
      codeSubmitBtn.disabled = false;
      codeSubmitBtn.textContent = '🎁 Continuar';
      codeStatusMessage.className = 'status-message error';

      if (error.status === 429) {
        codeStatusMessage.textContent = error.message || '⏳ Muitas tentativas. Aguarde alguns minutos.';
      } else {
        codeStatusMessage.textContent = '❌ Código inválido ou não encontrado. Verifique e tente novamente.';
      }
      clearCode();
    }
  });

  // =========================================================================
  // TELA 2: NOME
  // =========================================================================

  nameInput.addEventListener('input', () => {
    nameSubmitBtn.disabled = nameInput.value.trim().length === 0;
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !nameSubmitBtn.disabled) {
      e.preventDefault();
      nameSubmitBtn.click();
    }
  });

  nameSubmitBtn.addEventListener('click', () => {
    const nameVal = nameInput.value.trim();
    if (!nameVal) return;
    currentName = nameVal;
    goToStep3(currentName);
  });

  nameBackBtn.addEventListener('click', () => {
    goToStep1();
  });

  // =========================================================================
  // TELA 3: CONFIRMAÇÃO
  // =========================================================================

  confirmBackBtn.addEventListener('click', () => {
    goToStep2();
  });

  confirmYesBtn.addEventListener('click', async () => {
    confirmYesBtn.disabled = true;
    confirmYesBtn.textContent = 'Confirmando...';
    confirmStatusMessage.className = 'status-message loading';
    confirmStatusMessage.textContent = '🔒 Registrando sua confirmação...';

    try {
      const result = await fetchDrawResult(currentCode, currentName);
      goToStep4(result);
    } catch (error) {
      confirmYesBtn.disabled = false;
      confirmYesBtn.textContent = '✅ Sim, sou eu!';
      confirmStatusMessage.className = 'status-message error';

      if (error.status === 429) {
        confirmStatusMessage.textContent = error.message || '⏳ Muitas tentativas para este código. Bloqueado temporariamente.';
      } else {
        confirmStatusMessage.textContent = '❌ Não foi possível confirmar. Confira o nome e o código.';
      }
    }
  });

  // =========================================================================
  // TELA 4: RESULTADO
  // =========================================================================

  newCodeBtn.addEventListener('click', () => {
    clearCode();
    currentCode = '';
    currentName = '';
    codeInput.value = '';
    nameInput.value = '';
    goToStep1();
  });

  // =========================================================================
  // AUTO-PREENCHIMENTO DE SESSÃO
  // =========================================================================
  const savedCode = getSavedCode();
  if (savedCode) {
    codeInput.value = savedCode;
    codeInput.dispatchEvent(new Event('input'));
    codeSubmitBtn.click();
  } else {
    goToStep1();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
