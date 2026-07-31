// Um tick de simulação: movimento dos jogadores + avanço/colisão dos
// projéteis. É a mesma lógica usada pelo servidor (partidas online, 60hz) e
// pelo cliente (modo bot offline), garantindo que as duas experiências sigam
// exatamente as mesmas regras.

import { clamp, rectsIntersect, circleHitsProjectile, movementDelta } from './physics.js';
import { PLAYER_SIZE, PROJECTILE_SIZE, PLAYER_SPEED, SHIELD_RADIUS, SHIELD_MAX_HITS } from './constants.js';

export function stepPlayers(players, arena) {
  for (const p of players) {
    if (!p.alive) continue;
    // Escudo esgotado não pode mais ser usado.
    if (p.shielding && p.shieldHits >= SHIELD_MAX_HITS) p.shielding = false;
    // Em modo de defesa o jogador fica imóvel.
    if (p.shielding) continue;
    const { dx, dy } = movementDelta(p.input);
    p.x = clamp(p.x + dx * PLAYER_SPEED, 0, arena.w - PLAYER_SIZE);
    p.y = clamp(p.y + dy * PLAYER_SPEED, 0, arena.h - PLAYER_SIZE);
  }
}

// Avança os projéteis e resolve colisões, retornando a lista sobrevivente.
// `onPlayerDown(ownerIndex, target)` é chamado quando um jogador perde a
// última vida — quem chama decide o que isso significa (fim de partida
// online, fim de partida local contra o bot, etc.).
export function stepProjectiles(projectiles, players, arena, onPlayerDown) {
  return projectiles.filter((proj) => {
    proj.x += proj.vx;
    proj.y += proj.vy;

    if (proj.x < -PROJECTILE_SIZE || proj.x > arena.w + PROJECTILE_SIZE ||
        proj.y < -PROJECTILE_SIZE || proj.y > arena.h + PROJECTILE_SIZE) {
      return false;
    }

    const target = players[proj.ownerIndex === 0 ? 1 : 0];

    if (target.alive && target.shielding && target.shieldHits < SHIELD_MAX_HITS &&
      circleHitsProjectile(target, proj, PLAYER_SIZE, SHIELD_RADIUS, PROJECTILE_SIZE)) {
      target.shieldHits += 1;
      if (target.shieldHits >= SHIELD_MAX_HITS) target.shielding = false;
      return false;
    }

    if (target.alive && rectsIntersect(
      proj.x - PROJECTILE_SIZE / 2, proj.y - PROJECTILE_SIZE / 2, PROJECTILE_SIZE, PROJECTILE_SIZE,
      target.x, target.y, PLAYER_SIZE, PLAYER_SIZE
    )) {
      target.lives -= 1;
      if (target.lives <= 0) {
        target.lives = 0;
        target.alive = false;
        if (onPlayerDown) onPlayerDown(proj.ownerIndex, target);
      }
      return false;
    }

    return true;
  });
}
