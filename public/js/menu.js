import { menuEl, gameWrapEl, canvas } from './dom.js';
import { state, resetMatchState } from './state.js';
import { hideWaitingOverlay, hideCountdown } from './overlays.js';
import { hideGameOverOverlay } from './gameOver.js';
import { startOnlineCountPolling, stopOnlineCountPolling } from './onlineCount.js';
import { startRankingPolling, stopRankingPolling } from './ranking.js';
import { startOnline as connectOnline, closeConnection } from './network.js';
import { startBot as startBotMatch, stopBot } from './bot.js';
import { commitNickname } from './nickname.js';
import { resetEscHint } from './input.js';
import { resetHud } from './hud.js';
import { openBotClassSelect } from './botClassSelect.js';
import { updateGameScale } from './gameScale.js';
import { startMenuBackground, stopMenuBackground } from './menuBackground.js';
import { stopMatchTutorial, shouldStartMatchTutorial } from './tutorial/matchTutorial.js';

export function showMenu() {
  menuEl.style.display = 'flex';
  gameWrapEl.style.display = 'none';
  document.body.classList.remove('game-active');
  hideWaitingOverlay();
  startOnlineCountPolling();
  startRankingPolling();
  startMenuBackground();
}

export function showGame() {
  menuEl.style.display = 'none';
  gameWrapEl.style.display = 'flex';
  document.body.classList.add('game-active');
  stopOnlineCountPolling();
  stopRankingPolling();
  stopMenuBackground();
  updateGameScale();
}

// Ponto único de limpeza entre partidas: encerra o que sobrou da partida
// anterior (loop do bot, conexão online, contagem regressiva pendente) e zera
// estado e HUD antes de começar a próxima.
function prepareNewMatch() {
  stopBot();
  closeConnection();
  resetMatchState();
  canvas.width = state.arena.w;
  canvas.height = state.arena.h;
  hideGameOverOverlay();
  hideWaitingOverlay();
  hideCountdown();
  resetHud();
  resetEscHint();
  stopMatchTutorial();
}

export function startOnline() {
  if (!commitNickname()) return;
  // Na primeira partida do jogador, mesmo escolhendo "Jogar online", cai no
  // tutorial interativo contra bot — só assim dá pra garantir que o
  // "oponente" não atira nele durante o tutorial (não seria possível com um
  // adversário online de verdade).
  if (shouldStartMatchTutorial()) {
    startBot();
    return;
  }
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
  state.mode = null;
  prepareNewMatch();
  showMenu();
  if (state.pendingTrainingRedirect) {
    state.pendingTrainingRedirect = false;
    openBotClassSelect(startBot);
  }
}
