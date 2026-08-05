import { state, screenXToWorld, computeFacing } from './state.js';
import { canvas, escHintEl } from './dom.js';
import { isShieldAvailable } from './hud.js';
import { sendInput, sendShoot } from './network.js';
import { botShoot } from './bot.js';
import { backToMenu } from './menu.js';
import { notifyMatchTutorial } from './tutorial/matchTutorial.js';
import { playShieldUpSound, playUnavailableSound } from './audio.js';
import { getClass } from '../../shared/classes.js';

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

// Só para escolher o som do clique de tiro: quem manda no cooldown é o lado
// autoritativo (servidor ou simulação do bot). `lastShot` vem do último
// snapshot, é a mesma conta que a barra de cooldown do HUD já faz.
function tiroPronto() {
  const me = state.latestState.players[state.playerIndex];
  if (!me) return true;
  return Date.now() - (me.lastShot || 0) >= getClass(me.classId).shotCooldownMs;
}

// O personagem olha para onde o mouse está mirando. `facing` só muda de
// sinal quando o mouse cruza o centro do jogador, então isto é barato de
// chamar a cada mousemove — na prática só dispara `sendInput` nas raras
// vezes em que a direção realmente vira.
function updateFacingFromMouse() {
  if (!state.mode || state.playerIndex === null) return;
  const me = state.mode === 'bot'
    ? state.bot?.players[0]
    : state.latestState.players[state.playerIndex];
  if (!me) return;
  const worldMouseX = screenXToWorld(state.mouse.x);
  const newFacing = computeFacing(worldMouseX, me.x);
  if (newFacing !== state.facing) {
    state.facing = newFacing;
    if (state.mode === 'online') sendInput();
  }
}

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
      const emPartida = state.matchStarted && !state.gameOver && !state.desempate;
      if (!state.input.shield && emPartida && isShieldAvailable()) {
        state.input.shield = true;
        sendInput();
        playShieldUpSound();
        notifyMatchTutorial('shield');
      } else if (emPartida && !isShieldAvailable()) {
        // Escudo esgotado. O keydown repete enquanto a tecla fica pressionada,
        // mas o efeito tem janela anti-repetição própria (audio.js).
        playUnavailableSound();
      }
      return;
    }
    const dir = keyMap[e.code];
    // No desempate a partida está congelada: mover e atirar não valem mais.
    if (dir && !state.input[dir] && !state.desempate) {
      state.input[dir] = true;
      sendInput();
      // O tutorial precisa saber *qual* direção foi apertada: o passo de
      // movimento só termina depois das quatro teclas.
      notifyMatchTutorial('move', dir);
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
    updateFacingFromMouse();
  });

  window.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select, textarea')) return;
    if (!state.mode) return;
    if (state.gameOver) {
      return;
    }
    if (!state.matchStarted || state.desempate) return;
    // Em modo de defesa o jogador não atira. A regra é aplicada de novo do lado
    // autoritativo (`escudoAtivo` em wsServer/bot); aqui é só para o clique não
    // consumir cooldown nem avançar o tutorial à toa.
    if (state.input.shield && isShieldAvailable()) {
      playUnavailableSound();
      return;
    }
    // O clique continua sendo enviado mesmo em cooldown (é o lado autoritativo
    // que decide se sai tiro); aqui o som só avisa que ainda não recarregou.
    if (!tiroPronto()) playUnavailableSound();
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
