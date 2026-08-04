import { state, screenXToWorld } from './state.js';
import { canvas, escHintEl } from './dom.js';
import { isShieldAvailable } from './hud.js';
import { sendInput, sendShoot } from './network.js';
import { botShoot } from './bot.js';
import { backToMenu } from './menu.js';
import { rerollWinnerEmoji } from './gameOver.js';
import { notifyMatchTutorial } from './tutorial/matchTutorial.js';

const keyMap = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

const ESC_CONFIRM_WINDOW_MS = 2000;
const ESC_DEFAULT_TEXT = 'Aperte ESC 2 vezes para sair';
const ESC_CONFIRM_TEXT = 'Aperte ESC novamente para sair';

let escArmed = false;
let escResetTimer = null;

export function resetEscHint() {
  escArmed = false;
  clearTimeout(escResetTimer);
  escResetTimer = null;
  escHintEl.textContent = ESC_DEFAULT_TEXT;
  escHintEl.classList.remove('armed');
}

function handleEscPress() {
  if (!state.mode) return;
  if (escArmed) {
    resetEscHint();
    backToMenu();
    return;
  }
  escArmed = true;
  escHintEl.textContent = ESC_CONFIRM_TEXT;
  escHintEl.classList.add('armed');
  clearTimeout(escResetTimer);
  escResetTimer = setTimeout(resetEscHint, ESC_CONFIRM_WINDOW_MS);
}

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      handleEscPress();
      return;
    }
    if (!state.mode) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.input.shield && state.matchStarted && !state.gameOver && isShieldAvailable()) {
        state.input.shield = true;
        sendInput();
        notifyMatchTutorial('shield');
      }
      return;
    }
    const dir = keyMap[e.code];
    if (dir && !state.input[dir]) {
      state.input[dir] = true;
      sendInput();
      notifyMatchTutorial('move');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (!state.mode) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.input.shield) {
        state.input.shield = false;
        sendInput();
      }
      return;
    }
    const dir = keyMap[e.code];
    if (dir && state.input[dir]) {
      state.input[dir] = false;
      sendInput();
    }
  });

  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    state.mouse.x = (e.clientX - rect.left) * scaleX;
    state.mouse.y = (e.clientY - rect.top) * scaleY;
  });

  window.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select, textarea')) return;
    if (!state.mode) return;
    if (state.gameOver) {
      rerollWinnerEmoji();
      return;
    }
    if (!state.matchStarted) return;
    // Em modo de defesa o jogador não atira. A regra é aplicada de novo do lado
    // autoritativo (`escudoAtivo` em wsServer/bot); aqui é só para o clique não
    // consumir cooldown nem avançar o tutorial à toa.
    if (state.input.shield && isShieldAvailable()) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const targetX = screenXToWorld((e.clientX - rect.left) * scaleX);
    const targetY = (e.clientY - rect.top) * scaleY;

    if (state.mode === 'online') {
      sendShoot(targetX, targetY);
    } else if (state.mode === 'bot') {
      botShoot(targetX, targetY);
    }
    notifyMatchTutorial('shoot');
  });
}
