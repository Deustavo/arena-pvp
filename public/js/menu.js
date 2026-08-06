import { menuEl, gameWrapEl, canvas } from './dom.js';
import { state, resetMatchState } from './state.js';
import { hideWaitingOverlay, hideCountdown } from './overlays.js';
import { hideGameOverOverlay } from './gameOver.js';
import { startOnlineCountPolling, stopOnlineCountPolling } from './onlineCount.js';
import { startRankingPolling, stopRankingPolling } from './ranking.js';
import { startLiveMatchesPolling, stopLiveMatchesPolling } from './liveMatches.js';
import { startOnline as connectOnline, connectSpectator, closeConnection } from './network.js';
import { startBot as startBotMatch, stopBot } from './bot.js';
import { commitNickname } from './nickname.js';
import { resetEscHint } from './input.js';
import { resetHud, fillLocalPlayerHud } from './hud.js';
import { resetMatchTimer } from './matchTimer.js';
import { resetNearMiss } from './nearMiss.js';
import { resetPowerupVisuals } from './powerups.js';
import { openBotClassSelect } from './botClassSelect.js';
import { updateGameScale } from './gameScale.js';
import { stopMatchTutorial, shouldStartMatchTutorial, resetMatchTutorialFlag } from './tutorial/matchTutorial.js';

export function showMenu() {
  menuEl.style.display = 'flex';
  gameWrapEl.style.display = 'none';
  document.body.classList.remove('game-active');
  hideWaitingOverlay();
  startOnlineCountPolling();
  startRankingPolling();
  startLiveMatchesPolling();
}

export function showGame() {
  menuEl.style.display = 'none';
  gameWrapEl.style.display = 'flex';
  document.body.classList.add('game-active');
  document.body.style.removeProperty('--parallax-x');
  document.body.style.removeProperty('--parallax-y');
  stopOnlineCountPolling();
  stopRankingPolling();
  stopLiveMatchesPolling();
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
  fillLocalPlayerHud();
  resetMatchTimer();
  resetNearMiss();
  resetPowerupVisuals();
  resetEscHint();
  stopMatchTutorial();
  resetMatchTutorialFlag();
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

// Assistir uma partida em andamento (painel "Partidas ao vivo" do menu). Não
// passa por `commitNickname`/seleção de classe — espectador não joga.
export function watchMatch(matchId) {
  state.mode = 'spectator';
  prepareNewMatch();
  showGame();
  connectSpectator(matchId, backToMenu);
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
