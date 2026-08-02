import {
  waitingOverlayEl, countdownOverlayEl, countdownNumberEl,
  waitingLoaderEl, noOpponentsMessageEl, btnTryTrainingMode,
} from './dom.js';
import { state } from './state.js';

export function showWaitingOverlay() {
  waitingOverlayEl.style.display = 'flex';
}

export function hideWaitingOverlay() {
  waitingOverlayEl.style.display = 'none';
  hideNoOpponentsMessage();
}

// Exibido quando o servidor avisa que ninguém entrou na fila a tempo: pausa
// a animação de "aguardando" e sugere o modo treino em vez de jogar o
// jogador direto numa partida contra bot sem que ele peça.
export function showNoOpponentsMessage() {
  waitingLoaderEl.style.display = 'none';
  noOpponentsMessageEl.style.display = 'block';
  btnTryTrainingMode.style.display = 'inline-block';
}

export function hideNoOpponentsMessage() {
  waitingLoaderEl.style.display = '';
  noOpponentsMessageEl.style.display = 'none';
  btnTryTrainingMode.style.display = 'none';
}

export function showCountdown(ms, onDone) {
  hideWaitingOverlay();
  hideCountdown();
  countdownOverlayEl.style.display = 'flex';
  const endAt = Date.now() + ms;
  const tick = () => {
    const remaining = endAt - Date.now();
    const secs = Math.ceil(remaining / 1000);
    if (remaining <= 0) {
      countdownOverlayEl.style.display = 'none';
      state.countdownTimer = null;
      if (onDone) onDone();
      return;
    }
    countdownNumberEl.textContent = secs;
    state.countdownTimer = setTimeout(tick, 100);
  };
  tick();
}

export function hideCountdown() {
  if (state.countdownTimer) {
    clearTimeout(state.countdownTimer);
    state.countdownTimer = null;
  }
  countdownOverlayEl.style.display = 'none';
}
