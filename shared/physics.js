// Primitivas geométricas puras, sem estado — usadas pelo tick do servidor,
// pela simulação local do bot e pela predição no cliente.

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function circleHitsProjectile(player, proj, playerSize, shieldRadius, projectileSize) {
  const cx = player.x + playerSize / 2;
  const cy = player.y + playerSize / 2;
  return Math.hypot(proj.x - cx, proj.y - cy) <= shieldRadius + projectileSize / 2;
}

// Círculo contra retângulo: aproxima o centro do círculo do ponto mais próximo
// dentro do retângulo. Usado na coleta de power-up (bolha redonda contra o
// hitbox quadrado do jogador).
export function circleHitsRect(cx, cy, radius, rx, ry, rw, rh) {
  const nearestX = clamp(cx, rx, rx + rw);
  const nearestY = clamp(cy, ry, ry + rh);
  return Math.hypot(cx - nearestX, cy - nearestY) <= radius;
}

// Vetor de movimento normalizado (diagonal não é mais rápido que ortogonal).
export function movementDelta(input) {
  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  return { dx, dy };
}
