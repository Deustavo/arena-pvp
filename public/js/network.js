import { state } from './state.js';
import { SHIELD_RADIUS } from '../../shared/constants.js';
import { canvas } from './dom.js';
import { showWaitingOverlay, hideWaitingOverlay, showCountdown, hideCountdown } from './overlays.js';
import { updateHud, isShieldAvailable, initHearts } from './hud.js';
import { recordGameOver } from './gameOver.js';
import { playStartSound } from './audio.js';
import { reconcilePrediction } from './prediction.js';

// Chamado após qualquer atualização de estado que possa esgotar o escudo:
// se o servidor sinalizar que as cargas acabaram, solta a tecla localmente.
function releaseExhaustedShield() {
  if (state.input.shield && !isShieldAvailable()) {
    state.input.shield = false;
    sendInput();
  }
}

export function startOnline(onBackToMenu) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const nickname = encodeURIComponent(state.nickname);
  const classId = encodeURIComponent(state.classId);
  state.ws = new WebSocket(`${protocol}//${location.host}?nickname=${nickname}&classId=${classId}`);

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
      initHearts(msg.players.map((p) => p.lives));
      updateHud();
      showCountdown(msg.countdownMs);
      break;
    case 'start':
      state.matchStarted = true;
      hideCountdown();
      playStartSound();
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
    state.ws.send(JSON.stringify({ type: 'input', ...state.input }));
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
