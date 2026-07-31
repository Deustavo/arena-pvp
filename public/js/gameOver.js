import { gameOverOverlayEl, gameOverMessageEl } from './dom.js';
import { state } from './state.js';

export function recordGameOver(result) {
  state.gameOver = true;
  state.gameOverAt = Date.now();
  state.overlayShown = false;
  state.lastResult = result;
}

export function showGameOverOverlay() {
  state.overlayShown = true;
  gameOverOverlayEl.classList.remove('win', 'lose');
  let text;
  if (state.lastResult === 'win') {
    text = 'Você ganhou';
    gameOverOverlayEl.classList.add('win');
  } else if (state.lastResult === 'lose') {
    text = 'Você perdeu';
    gameOverOverlayEl.classList.add('lose');
  } else {
    text = 'Partida encerrada';
  }
  gameOverMessageEl.textContent = text;
  gameOverOverlayEl.style.display = 'flex';
}

export function hideGameOverOverlay() {
  gameOverOverlayEl.style.display = 'none';
  gameOverOverlayEl.classList.remove('win', 'lose');
}
