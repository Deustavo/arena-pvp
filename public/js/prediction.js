import { state, getWorldInput } from './state.js';
import { clamp, movementDelta } from '../../shared/physics.js';
import { PLAYER_SPEED, TICK_MS } from '../../shared/constants.js';
import { getClass } from '../../shared/classes.js';

const RECONCILE_LERP = 0.2;
const RECONCILE_SNAP_DIST = 40;

export function reconcilePrediction(mine) {
  if (!mine) return;
  if (!state.predicted.initialized || !mine.alive) {
    state.predicted.x = mine.x;
    state.predicted.y = mine.y;
    state.predicted.initialized = true;
    return;
  }
  const dx = mine.x - state.predicted.x;
  const dy = mine.y - state.predicted.y;
  if (Math.hypot(dx, dy) > RECONCILE_SNAP_DIST) {
    state.predicted.x = mine.x;
    state.predicted.y = mine.y;
  } else {
    state.predicted.x += dx * RECONCILE_LERP;
    state.predicted.y += dy * RECONCILE_LERP;
  }
}

export function advancePrediction() {
  const now = performance.now();
  if (state.lastFrameTime === null) {
    state.lastFrameTime = now;
    return;
  }
  const dt = now - state.lastFrameTime;
  state.lastFrameTime = now;

  if (!state.predicted.initialized) return;
  // No desempate a partida está congelada no servidor: prever movimento aqui
  // só faria o jogador andar na tela e ser puxado de volta na reconciliação.
  if (state.desempate) return;
  const me = state.latestState.players[state.playerIndex];
  if (!me || !me.alive) return;

  const { dx, dy } = movementDelta(getWorldInput());
  const speed = me.speed ?? getClass(me.classId).speed ?? PLAYER_SPEED;
  const speedPerMs = speed / TICK_MS;
  state.predicted.x = clamp(state.predicted.x + dx * speedPerMs * dt, 0, state.arena.w - state.playerSize);
  state.predicted.y = clamp(state.predicted.y + dy * speedPerMs * dt, 0, state.arena.h - state.playerSize);
}

const INTERP_DELAY_MS = 100;

export function getRenderState() {
  if (state.mode !== 'online' || state.stateBuffer.length < 2) return state.latestState;

  const renderTime = Date.now() - INTERP_DELAY_MS;
  let older = state.stateBuffer[0];
  let newer = state.stateBuffer[state.stateBuffer.length - 1];
  for (let i = 0; i < state.stateBuffer.length - 1; i++) {
    if (state.stateBuffer[i].t <= renderTime && state.stateBuffer[i + 1].t >= renderTime) {
      older = state.stateBuffer[i];
      newer = state.stateBuffer[i + 1];
      break;
    }
  }

  const span = newer.t - older.t;
  const t = span > 0 ? clamp((renderTime - older.t) / span, 0, 1) : 1;
  const players = newer.players.map((np, i) => {
    const op = older.players[i];
    if (!op || !np.alive || !op.alive) return np;
    return { ...np, x: op.x + (np.x - op.x) * t, y: op.y + (np.y - op.y) * t };
  });

  return { players, projectiles: newer.projectiles };
}
