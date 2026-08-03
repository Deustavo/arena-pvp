import { nicknameInput, nicknameErrorEl } from './dom.js';
import { state } from './state.js';
import { sanitizeNickname, isValidNickname } from '../../shared/nickname.js';

const STORAGE_KEY = 'jogoDoAno.nickname';

export function initNicknameInput() {
  const saved = sanitizeNickname(localStorage.getItem(STORAGE_KEY) || '');
  if (saved) {
    nicknameInput.value = saved;
    state.nickname = saved;
  }
  nicknameInput.addEventListener('input', () => {
    hideNicknameError();
  });
}

function hideNicknameError() {
  nicknameErrorEl.classList.remove('visible');
}

function showNicknameError() {
  nicknameErrorEl.classList.add('visible');
}

// Valida o nickname digitado e, se ok, salva em `state`/localStorage.
// Retorna true quando a partida pode prosseguir.
export function commitNickname() {
  // Com conta logada o nome vem dela, não do campo do menu (que fica escondido).
  if (state.user) {
    state.nickname = state.user.name;
    return true;
  }

  const nickname = sanitizeNickname(nicknameInput.value);
  if (!isValidNickname(nickname)) {
    showNicknameError();
    nicknameInput.focus();
    return false;
  }
  state.nickname = nickname;
  localStorage.setItem(STORAGE_KEY, nickname);
  hideNicknameError();
  return true;
}
