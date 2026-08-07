// Um tick de simulação: movimento dos jogadores + avanço/colisão dos
// projéteis. É a mesma lógica usada pelo servidor (partidas online, 60hz) e
// pelo cliente (modo bot offline), garantindo que as duas experiências sigam
// exatamente as mesmas regras.

import { clamp, rectsIntersect, circleHitsProjectile, movementDelta } from './physics.js';
import { PLAYER_SIZE, PROJECTILE_SIZE, SHIELD_RADIUS } from './constants.js';
import { velocidadeAtual } from './powerups.js';
import { ventoDirecao, ventoForca, geloAtrito } from './arenaEvents.js';

// `arenaTipo` vem do sorteio da partida (ver shared/arenaEvents.js) — cada
// arena interfere de um jeito diferente no movimento: areia empurra os dois
// jogadores nas rajadas de vento e gelo troca a parada instantânea por
// deslize (terra e fogo não mexem no movimento, só em velocidade/dano fora
// daqui). Os três consumidores da simulação (servidor, bot e o próprio
// teste) pegam o efeito de graça. `restanteMs` (tempo restante de partida)
// intensifica vento e gelo nos últimos segundos — ver faseFinalFator em
// shared/arenaEvents.js.
export function stepPlayers(players, arena, agora = Date.now(), arenaTipo = null, restanteMs = Infinity) {
  const gelo = arenaTipo === 'gelo';
  const atrito = geloAtrito(restanteMs);
  const vento = ventoDirecao(arenaTipo, agora) * ventoForca(restanteMs);

  for (const p of players) {
    if (!p.alive) continue;
    // Escudo esgotado não pode mais ser usado.
    if (p.shielding && p.shieldHits >= p.shieldMaxHits) p.shielding = false;
    const { dx, dy } = movementDelta(p.input);
    // Velocidade da classe, 40% maior enquanto o power-up de velocidade
    // estiver ativo (ver shared/powerups.js).
    const speed = velocidadeAtual(p, agora);

    if (gelo) {
      // Cada tick só se aproxima da velocidade "alvo" do input, mantendo
      // parte do embalo do tick anterior — é o que dá a sensação de deslize.
      p.vx = p.vx * atrito + dx * speed * (1 - atrito);
      p.vy = p.vy * atrito + dy * speed * (1 - atrito);
      p.x = clamp(p.x + p.vx + vento, 0, arena.w - PLAYER_SIZE);
      p.y = clamp(p.y + p.vy, 0, arena.h - PLAYER_SIZE);
    } else {
      p.x = clamp(p.x + dx * speed + vento, 0, arena.w - PLAYER_SIZE);
      p.y = clamp(p.y + dy * speed, 0, arena.h - PLAYER_SIZE);
    }
  }
}

// Avança os projéteis e resolve colisões, retornando a lista sobrevivente.
// `onPlayerDown(ownerIndex, target)` é chamado quando um jogador perde a
// última vida — quem chama decide o que isso significa (fim de partida
// online, fim de partida local contra o bot, etc.).
export function stepProjectiles(projectiles, players, arena, onPlayerDown) {
  // Projéteis de um mesmo disparo em leque (ex.: o cone de 3 tiros do mago)
  // chegam ao alvo no mesmo tick. Sem esse controle, cada um deles gastava uma
  // carga de escudo separada e um único disparo furava o escudo inteiro de
  // classes frágeis (assassino, duelista) de uma vez só — o escudo bloqueia o
  // leque todo como um único evento de defesa, gastando no máximo 1 carga por
  // tick, igual a levar um tiro só.
  const escudoGastoNesteTick = new Set();
  return projectiles.filter((proj) => {
    proj.x += proj.vx;
    proj.y += proj.vy;

    const size = proj.size ?? PROJECTILE_SIZE;
    if (proj.x < -size || proj.x > arena.w + size ||
        proj.y < -size || proj.y > arena.h + size) {
      return false;
    }

    // Projéteis de alcance limitado (ex.: o tiro curto do tank) somem ao
    // ultrapassar a distância percorrida desde o disparo.
    if (Number.isFinite(proj.range) &&
      Math.hypot(proj.x - proj.startX, proj.y - proj.startY) > proj.range) {
      return false;
    }

    const target = players[proj.ownerIndex === 0 ? 1 : 0];

    if (target.alive && target.shielding && target.shieldHits < target.shieldMaxHits &&
      circleHitsProjectile(target, proj, PLAYER_SIZE, SHIELD_RADIUS, size)) {
      if (!escudoGastoNesteTick.has(target)) {
        target.shieldHits += 1;
        if (target.shieldHits >= target.shieldMaxHits) target.shielding = false;
        escudoGastoNesteTick.add(target);
      }
      return false;
    }

    if (target.alive && rectsIntersect(
      proj.x - size / 2, proj.y - size / 2, size, size,
      target.x, target.y, PLAYER_SIZE, PLAYER_SIZE
    )) {
      // Tiro do sniper: dano maior se o projétil percorreu uma distância
      // longa desde o disparo até acertar o alvo.
      let damage = proj.damage ?? 1;
      if (proj.longRangeDistance != null &&
        Math.hypot(proj.x - proj.startX, proj.y - proj.startY) >= proj.longRangeDistance) {
        damage = proj.longRangeDamage;
      }
      applyDamage(target, damage, proj.ownerIndex, onPlayerDown);
      return false;
    }

    return true;
  });
}

function applyDamage(target, amount, ownerIndex, onPlayerDown) {
  target.lives -= amount;
  if (target.lives <= 0) {
    target.lives = 0;
    target.alive = false;
    if (onPlayerDown) onPlayerDown(ownerIndex, target);
  }
}
