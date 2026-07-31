import { state } from './state.js';
import { canvas, escHintEl } from './dom.js';
import { isShieldAvailable } from './hud.js';
import { sendInput, sendShoot } from './network.js';
import { botShoot } from './bot.js';
import { backToMenu } from './menu.js';

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
        // Ao defender, o movimento acumulado é descartado.
        state.input.up = state.input.down = state.input.left = state.input.right = false;
        sendInput();
      }
      return;
    }
    const dir = keyMap[e.code];
    if (dir && !state.input[dir] && !state.input.shield) {
      state.input[dir] = true;
      sendInput();
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

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouse.x = e.clientX - rect.left;
    state.mouse.y = e.clientY - rect.top;
  });

  canvas.addEventListener('click', (e) => {
    if (!state.mode || state.gameOver || !state.matchStarted) return;
    // Em modo de defesa o jogador não atira.
    if (state.input.shield && isShieldAvailable()) return;
    const rect = canvas.getBoundingClientRect();
    const targetX = e.clientX - rect.left;
    const targetY = e.clientY - rect.top;

    if (state.mode === 'online') {
      sendShoot(targetX, targetY);
    } else if (state.mode === 'bot') {
      botShoot(targetX, targetY);
    }
  });
}
