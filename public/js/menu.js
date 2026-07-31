import { menuEl, gameWrapEl, canvas } from './dom.js';
import { state, resetMatchState } from './state.js';
import { hideWaitingOverlay, hideCountdown } from './overlays.js';
import { hideGameOverOverlay } from './gameOver.js';
import { initHearts } from './hud.js';
import { startOnlineCountPolling, stopOnlineCountPolling } from './onlineCount.js';
import { startOnline as connectOnline, closeConnection } from './network.js';
import { startBot as startBotMatch, stopBot } from './bot.js';
import { commitNickname } from './nickname.js';

export function showMenu() {
  menuEl.style.display = 'flex';
  gameWrapEl.style.display = 'none';
  hideWaitingOverlay();
  startOnlineCountPolling();
}

export function showGame() {
  menuEl.style.display = 'none';
  gameWrapEl.style.display = 'flex';
  stopOnlineCountPolling();
}

function prepareNewMatch() {
  resetMatchState();
  canvas.width = state.arena.w;
  canvas.height = state.arena.h;
  initHearts();
  hideGameOverOverlay();
  hideWaitingOverlay();
  hideCountdown();
}

export function startOnline() {
  if (!commitNickname()) return;
  state.mode = 'online';
  prepareNewMatch();
  showGame();
  connectOnline(backToMenu);
}

export function startBot() {
  if (!commitNickname()) return;
  prepareNewMatch();
  showGame();
  startBotMatch();
}

export function backToMenu() {
  stopBot();
  closeConnection();
  state.mode = null;
  prepareNewMatch();
  showMenu();
}
