import { gameOverOverlayEl, gameOverMessageEl, btnSwapClasses } from './dom.js';
import { state } from './state.js';
import { stopMatchTutorial } from './tutorial/matchTutorial.js';

const WINNER_EMOJIS = ['😆', '🤣', '😂', '😅', '😘', '😜', '🤪', '😢', '🤫', '😹', '👻', '🤡', '👀'];

function randomWinnerEmoji() {
  return WINNER_EMOJIS[Math.floor(Math.random() * WINNER_EMOJIS.length)];
}

// Troca o emoji exibido sobre o vencedor por outro aleatório — chamado a
// cada clique na tela enquanto o overlay de fim de jogo estiver ativo.
export function rerollWinnerEmoji() {
  if (state.winnerIndex === null) return;
  state.winnerEmoji = randomWinnerEmoji();
}

export function recordGameOver(result) {
  stopMatchTutorial();
  state.gameOver = true;
  state.gameOverAt = Date.now();
  state.overlayShown = false;
  state.lastResult = result;
  if (result === 'win') {
    state.winnerIndex = state.playerIndex;
  } else if (result === 'lose') {
    state.winnerIndex = state.playerIndex === 0 ? 1 : 0;
  } else {
    state.winnerIndex = null;
  }
  state.winnerEmoji = state.winnerIndex !== null ? randomWinnerEmoji() : null;
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
  btnSwapClasses.style.display = (state.mode === 'bot' || state.mode === 'online') ? 'block' : 'none';
  gameOverOverlayEl.style.display = 'flex';
}

export function hideGameOverOverlay() {
  gameOverOverlayEl.style.display = 'none';
  gameOverOverlayEl.classList.remove('win', 'lose');
}
