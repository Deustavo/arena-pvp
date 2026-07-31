import { ARENA, PLAYER_SIZE, MAX_LIVES, PROJECTILE_SPEED } from './constants.js';

// Estado inicial de um jogador (posição inicial depende do lado da arena).
// O chamador (servidor ou bot) acrescenta os campos que só fazem sentido no
// seu contexto (ex.: `ws`/`color` no servidor).
export function createPlayerState(index) {
  return {
    x: index === 0 ? 100 : ARENA.w - 100 - PLAYER_SIZE,
    y: ARENA.h / 2 - PLAYER_SIZE / 2,
    lives: MAX_LIVES,
    input: { up: false, down: false, left: false, right: false },
    lastShot: 0,
    alive: true,
    shielding: false,
    shieldHits: 0,
  };
}

export function createProjectile(id, cx, cy, targetX, targetY, ownerIndex, speed = PROJECTILE_SPEED) {
  let dx = targetX - cx;
  let dy = targetY - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  return {
    id,
    x: cx,
    y: cy,
    vx: dx * speed,
    vy: dy * speed,
    ownerIndex,
  };
}
