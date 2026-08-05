import { state } from './state.js';
import {
  onlineClassOverlayEl, classListEl, classPreviewEl, classDetailsEl,
  btnOnlineClassClose, btnOnlineClassConfirm,
} from './dom.js';
import { createClassPicker, LOCK_ICON } from './classSelect.js';
import { createClassPreview } from './classPreview.js';
import { isLoggedIn } from './auth.js';
import { DEFAULT_CLASS_ID } from '../../shared/classes.js';

const MENSAGEM_CLASSE_BLOQUEADA = 'Crie uma conta para jogar com essa classe';
const TEXTO_BOTAO_JOGAR = 'Jogar';

// Convidado (sem conta) só pode jogar online com o atirador — as demais
// classes ficam com um cadeado no cartão (visual, o cartão continua clicável
// para ver as características) e bloqueiam o botão "Jogar".
function classeBloqueada(cls) {
  return !isLoggedIn() && cls.id !== DEFAULT_CLASS_ID;
}

let onConfirm = null;
let playerPicker = null;
let preview = null;

export function initOnlineClassSelect() {
  if (!onlineClassOverlayEl) return;

  preview = createClassPreview(classPreviewEl);

  playerPicker = createClassPicker({
    listEl: classListEl,
    detailsEl: classDetailsEl,
    getSelectedId: () => state.classId,
    setSelectedId: (id) => { state.classId = id; },
    onPreview: (cls) => {
      preview.setClass(cls.id);
      atualizarBotaoJogar(cls);
    },
    isLocked: classeBloqueada,
  });

  btnOnlineClassClose.addEventListener('click', closeOnlineClassSelect);
  btnOnlineClassConfirm.addEventListener('click', () => {
    if (btnOnlineClassConfirm.disabled) return;
    closeOnlineClassSelect();
    if (onConfirm) onConfirm();
  });
  onlineClassOverlayEl.addEventListener('click', (e) => {
    if (e.target === onlineClassOverlayEl) closeOnlineClassSelect();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOnlineClassSelectOpen()) closeOnlineClassSelect();
  });
}

// Bloqueado, o botão vira a própria mensagem (com cadeado) em vez de "Jogar" —
// sem tooltip: a mensagem já está sempre visível.
function atualizarBotaoJogar(cls) {
  if (!btnOnlineClassConfirm) return;
  const bloqueada = classeBloqueada(cls);
  btnOnlineClassConfirm.disabled = bloqueada;
  btnOnlineClassConfirm.classList.toggle('locked', bloqueada);
  btnOnlineClassConfirm.innerHTML = bloqueada
    ? `<span class="btn-lock-icon">${LOCK_ICON}</span>${MENSAGEM_CLASSE_BLOQUEADA}`
    : TEXTO_BOTAO_JOGAR;
}

export function openOnlineClassSelect(confirmCallback) {
  onConfirm = confirmCallback;
  onlineClassOverlayEl.style.display = 'flex';
  playerPicker.refresh();
}

export function closeOnlineClassSelect() {
  preview.stop();
  onlineClassOverlayEl.classList.add('closing');
  onlineClassOverlayEl.addEventListener('animationend', () => {
    onlineClassOverlayEl.style.display = 'none';
    onlineClassOverlayEl.classList.remove('closing');
  }, { once: true });
}

export function isOnlineClassSelectOpen() {
  return onlineClassOverlayEl.style.display === 'flex';
}
