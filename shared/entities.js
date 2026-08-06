import { ARENA, PLAYER_SIZE, PROJECTILE_SPEED, PROJECTILE_SIZE } from './constants.js';
import { getClass, DEFAULT_CLASS_ID } from './classes.js';

// Estado inicial de um jogador (posição inicial depende do lado da arena).
// O chamador (servidor ou bot) acrescenta os campos que só fazem sentido no
// seu contexto (ex.: `ws`/`color` no servidor).
export function createPlayerState(index, classId = DEFAULT_CLASS_ID) {
  const cls = getClass(classId);
  return {
    x: index === 0 ? 100 : ARENA.w - 100 - PLAYER_SIZE,
    y: ARENA.h / 2 - PLAYER_SIZE / 2,
    classId: cls.id,
    lives: cls.maxLives,
    shieldMaxHits: cls.shieldMaxHits,
    speed: cls.speed,
    input: { up: false, down: false, left: false, right: false },
    lastShot: 0,
    alive: true,
    shielding: false,
    shieldHits: 0,
    // Direção que o personagem olha (1 = direita, -1 = esquerda), em espaço
    // de mundo. Segue a mira do jogador (mouse) ou, no caso do bot, a
    // posição do adversário — ver shared/botStrategy.js#computeBotFacing.
    facing: 1,
    // Fim (timestamp) dos buffs temporários dos power-ups de cadência e
    // velocidade — ver shared/powerups.js.
    buffs: { cadenciaAte: 0, velocidadeAte: 0 },
  };
}

// Escudo levantado e ainda com hits disponíveis. Enquanto está ativo o jogador
// pode se mover, mas não pode atirar — defender é abrir mão do ataque.
export function escudoAtivo(player) {
  return !!player.shielding && player.shieldHits < player.shieldMaxHits;
}

export function createProjectile(
  id, cx, cy, targetX, targetY, ownerIndex, speed = PROJECTILE_SPEED, damage = 1,
  size = PROJECTILE_SIZE, range = Infinity, longRangeDistance = null, longRangeDamage = null
) {
  let dx = targetX - cx;
  let dy = targetY - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  return {
    id,
    x: cx,
    y: cy,
    startX: cx,
    startY: cy,
    vx: dx * speed,
    vy: dy * speed,
    ownerIndex,
    damage,
    size,
    range,
    // Tiro do sniper: dano maior se atingir o alvo longe do ponto de disparo.
    longRangeDistance,
    longRangeDamage,
  };
}

// Cria os projéteis de um disparo, considerando o padrão da classe do
// atirador (tiro único, leque em cone como o do mago, ou o projétil maior e
// de alcance menor do tank).
export function createShotProjectiles(nextId, cx, cy, targetX, targetY, ownerIndex, classId) {
  const cls = getClass(classId);
  const count = Math.max(1, cls.projectileCount);
  const baseAngle = Math.atan2(targetY - cy, targetX - cx);
  const spreadRad = (cls.coneSpreadDeg * Math.PI) / 180;
  const projectiles = [];
  let id = nextId;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = baseAngle + t * spreadRad;
    const tx = cx + Math.cos(angle) * 1000;
    const ty = cy + Math.sin(angle) * 1000;
    projectiles.push(createProjectile(
      id++, cx, cy, tx, ty, ownerIndex, PROJECTILE_SPEED, cls.damage, cls.projectileSize, cls.range,
      cls.longRangeDistance ?? null, cls.longRangeDamage ?? null
    ));
  }
  return { projectiles, nextId: id };
}
