import { gameOverOverlayEl, gameOverMessageEl, btnPlayAgain, btnSwapClasses } from './dom.js';
import { state } from './state.js';
import { wasMatchTutorial, stopMatchTutorial } from './tutorial/matchTutorial.js';
import { playVictorySound, playDefeatSound } from './audio.js';

// Guarda se a partida que terminou era o tutorial, para esconder "Jogar
// novamente"/"Trocar classes" no overlay de fim de jogo — depois do tutorial
// só faz sentido voltar ao menu.
let lastMatchWasTutorial = false;

export function recordGameOver(result) {
  lastMatchWasTutorial = wasMatchTutorial();
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
}

// Fim de uma partida assistida (modo espectador): não há "você" vencendo ou
// perdendo, só um resultado neutro — quem venceu, ou empate no desempate.
export function recordSpectatorGameOver(winnerIndex) {
  lastMatchWasTutorial = false;
  state.gameOver = true;
  state.gameOverAt = Date.now();
  state.overlayShown = false;
  state.lastResult = winnerIndex === null ? 'draw' : 'spectator';
  state.winnerIndex = winnerIndex;
}

// O jingle toca aqui e não em recordGameOver de propósito: a partida acaba com
// a explosão do jogador, e os dois sons no mesmo instante só embolam. O overlay
// aparece GAMEOVER_OVERLAY_DELAY depois (render.js), quando a explosão já
// terminou.
export function showGameOverOverlay() {
  state.overlayShown = true;
  gameOverOverlayEl.classList.remove('win', 'lose');
  let text;
  if (state.lastResult === 'win') {
    text = 'Você ganhou';
    gameOverOverlayEl.classList.add('win');
    playVictorySound();
  } else if (state.lastResult === 'lose') {
    text = 'Você perdeu';
    gameOverOverlayEl.classList.add('lose');
    playDefeatSound();
  } else if (state.lastResult === 'draw') {
    // Único jeito de empatar: os dois zerarem no mesmo passo do desempate.
    text = 'Empate';
    // Empate usa o som de derrota: em nenhum dos dois casos o jogador ganhou.
    playDefeatSound();
  } else if (state.lastResult === 'spectator') {
    // Fim de uma partida assistida: resultado neutro, sem jingle de
    // vitória/derrota (nenhum dos dois é "o jogador").
    const winner = state.latestState.players[state.winnerIndex];
    text = winner ? `${winner.name} venceu` : 'Partida encerrada';
  } else {
    text = 'Partida encerrada';
  }
  gameOverMessageEl.textContent = text;
  // Ao terminar o tutorial ou uma partida assistida, só faz sentido oferecer
  // "Menu inicial" — não há classe/modo próprio pra repetir.
  btnPlayAgain.style.display = (lastMatchWasTutorial || state.mode === 'spectator') ? 'none' : 'block';
  btnSwapClasses.style.display = !lastMatchWasTutorial && (state.mode === 'bot' || state.mode === 'online') ? 'block' : 'none';
  gameOverOverlayEl.style.display = 'flex';
}

export function hideGameOverOverlay() {
  gameOverOverlayEl.style.display = 'none';
  gameOverOverlayEl.classList.remove('win', 'lose');
}
