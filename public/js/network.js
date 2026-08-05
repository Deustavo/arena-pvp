import { state, computeInitialViewFlip, getWorldInput } from './state.js';
import { SHIELD_RADIUS } from '../../shared/constants.js';
import { canvas } from './dom.js';
import {
  showWaitingOverlay, hideWaitingOverlay, showCountdown, hideCountdown, showNoOpponentsMessage,
} from './overlays.js';
import { updateHud, isShieldAvailable, initHearts } from './hud.js';
import { recordGameOver } from './gameOver.js';
import { playStartSound, playMatchFoundSound } from './audio.js';
import { reconcilePrediction } from './prediction.js';
import { WS_URL } from './config.js';
import { getToken } from './auth.js';
import { updateGameScale } from './gameScale.js';
import { shouldStartMatchTutorial, startMatchTutorial } from './tutorial/matchTutorial.js';
import { atualizarCronometro } from './matchTimer.js';
import { MATCH_DURATION_MS } from '../../shared/matchTimer.js';

// Chamado após qualquer atualização de estado que possa esgotar o escudo:
// se o servidor sinalizar que as cargas acabaram, solta a tecla localmente.
function releaseExhaustedShield() {
  if (state.input.shield && !isShieldAvailable()) {
    state.input.shield = false;
    sendInput();
  }
}

export function startOnline(onBackToMenu) {
  const params = new URLSearchParams({
    nickname: state.nickname,
    classId: state.classId,
  });
  // Com conta logada o servidor usa o nome da conta e ignora o nickname acima.
  // O token vai na query string porque o browser não permite headers
  // customizados em `new WebSocket`.
  const token = getToken();
  if (token) params.set('token', token);

  state.ws = new WebSocket(`${WS_URL}?${params}`);

  state.ws.onopen = () => {
    showWaitingOverlay();
  };

  state.ws.onmessage = (event) => {
    handleOnlineMessage(JSON.parse(event.data), onBackToMenu);
  };

  state.ws.onclose = () => {
    if (state.mode === 'online') {
      hideWaitingOverlay();
    }
  };
}

function handleOnlineMessage(msg, onBackToMenu) {
  switch (msg.type) {
    case 'waiting':
      showWaitingOverlay();
      break;
    case 'noOpponents':
      showNoOpponentsMessage();
      break;
    case 'left':
      onBackToMenu();
      break;
    case 'init':
      state.playerIndex = msg.playerIndex;
      state.matchId = msg.matchId;
      state.arena = msg.arena;
      state.playerSize = msg.playerSize;
      state.projectileSize = msg.projectileSize;
      state.colors = msg.colors;
      state.shieldRadius = msg.shieldRadius ?? SHIELD_RADIUS;
      state.shieldMaxHits = msg.players.map((p) => p.shieldMaxHits ?? 1);
      canvas.width = state.arena.w;
      canvas.height = state.arena.h;
      state.gameOver = false;
      state.matchStarted = false;
      state.latestState = { players: msg.players, projectiles: [] };
      state.viewFlipped = computeInitialViewFlip(msg.players, state.playerIndex);
      // `initHearts` espera vidas na ordem visual [você, oponente], não na
      // ordem bruta do servidor — senão o HUD monta a fileira de corações do
      // slot errado quando o jogador local não é `players[0]` (ver initHearts
      // em hud.js).
      const oppIndex = state.playerIndex === 0 ? 1 : 0;
      initHearts([msg.players[state.playerIndex].lives, msg.players[oppIndex].lives]);
      updateHud();
      // O tempo regulamentar só começa a correr quando a partida começa, mas
      // o relógio já aparece cheio durante a contagem regressiva.
      atualizarCronometro(msg.matchDurationMs ?? MATCH_DURATION_MS, false);
      updateGameScale();
      // `init` é o momento em que o oponente apareceu: a contagem regressiva
      // (com seus próprios bipes) começa logo depois.
      playMatchFoundSound();
      showCountdown(msg.countdownMs, msg.players.map((p) => p.name));
      break;
    case 'start':
      state.matchStarted = true;
      hideCountdown();
      playStartSound();
      if (shouldStartMatchTutorial()) startMatchTutorial();
      break;
    case 'state': {
      state.latestState = msg;
      const now = Date.now();
      state.stateBuffer.push({ t: now, players: msg.players, projectiles: msg.projectiles });
      const cutoff = now - 1000;
      while (state.stateBuffer.length > 2 && state.stateBuffer[0].t < cutoff) state.stateBuffer.shift();
      reconcilePrediction(msg.players[state.playerIndex]);
      releaseExhaustedShield();
      updateHud();
      atualizarCronometro(msg.remainingMs ?? state.remainingMs, !!msg.desempate);
      break;
    }
    case 'gameover':
      if (msg.winnerIndex === state.playerIndex) {
        recordGameOver('win');
      } else if (msg.winnerIndex === null) {
        recordGameOver('draw');
      } else {
        recordGameOver('lose');
      }
      break;
  }
}

export function sendInput() {
  if (state.mode === 'online' && state.ws && state.ws.readyState === WebSocket.OPEN && state.playerIndex !== null) {
    state.ws.send(JSON.stringify({ type: 'input', ...getWorldInput(), facing: state.facing }));
  }
}

export function sendShoot(targetX, targetY) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN && state.playerIndex !== null) {
    state.ws.send(JSON.stringify({ type: 'shoot', targetX, targetY }));
  }
}

export function leaveQueue(onBackToMenu) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'leaveQueue' }));
  } else {
    onBackToMenu();
  }
}

export function closeConnection() {
  if (state.ws) {
    state.ws.onclose = null;
    state.ws.close();
    state.ws = null;
  }
}
