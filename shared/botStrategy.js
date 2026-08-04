// Estratégia de IA do bot por classe: além dos parâmetros de reflexo/mira por
// dificuldade (`botDifficulty.js`), cada classe joga de um jeito diferente —
// onde se posiciona em relação ao jogador e quando avança/recua. É usado
// tanto pelo servidor (`src/server/botAI.js`) quanto pelo modo treino local
// (`public/js/bot.js`), para os dois nunca divergirem.
import { ARENA, PLAYER_SIZE, PROJECTILE_SPEED } from './constants.js';

// Tempo que o assassino foge depois de atirar, para não ficar parado no
// alcance do troco logo após golpear (hit-and-run) — vida baixa não perdoa.
const ASSASSINO_RETREAT_MS = 450;

// Janela de detecção de ameaça (usada por desvio e escudo): só considera
// projéteis alinhados verticalmente e que estão de fato se aproximando do
// bot no eixo x — não assume de que lado o atirador está. Sem checar a
// direção do projétil (vx), um bot que cruzasse para o outro lado do
// adversário parava de "ver" os próprios tiros vindo em sua direção e nunca
// desviava/escudava, morrendo com o escudo intacto.
const THREAT_Y_TOLERANCE_PX = 60;
const THREAT_LOOKAHEAD_PX = 250;

export function createBotAiState() {
  return {
    aimTargetY: null,
    nextAimUpdate: 0,
    dodgeDecisions: new Map(),
    shieldDecisions: new Map(),
    prevPlayerX: null,
    prevPlayerY: null,
    retreatUntil: 0,
  };
}

function preferredDistance(classId, botCls) {
  switch (classId) {
    // Vida e escudo enormes: compensa pressionando de perto.
    case 'tank': return botCls.range - 10;
    // Leque de 3 projéteis cobre área, não precisa estar tão perto quanto um tiro único.
    case 'mago': return botCls.range - 90;
    // Cadência altíssima: mantém distância segura dentro do próprio alcance longo.
    case 'duelista': return botCls.range - 60;
    default: return botCls.range - 30;
  }
}

function sniperMovement(botCls, bot, player) {
  // O bônus de dano só vale a partir de longRangeDistance; abaixo disso o
  // sniper é frágil e recua em vez de trocar tiro de perto.
  const dxToPlayer = (player.x + PLAYER_SIZE / 2) - (bot.x + PLAYER_SIZE / 2);
  if (Math.abs(dxToPlayer) < botCls.longRangeDistance) {
    return { left: dxToPlayer > 0, right: dxToPlayer < 0 };
  }
  return { left: false, right: false };
}

function assassinoMovement(botCls, bot, player, aiState, now) {
  const dxToPlayer = (player.x + PLAYER_SIZE / 2) - (bot.x + PLAYER_SIZE / 2);
  if (aiState.retreatUntil > now) {
    return { left: dxToPlayer > 0, right: dxToPlayer < 0 };
  }
  const preferredRange = botCls.range - 40;
  return { left: dxToPlayer < preferredRange - 10, right: dxToPlayer > preferredRange + 10 };
}

// Decide o input horizontal do bot: aproximar, manter distância ou recuar,
// de acordo com a estratégia da classe.
export function computeBotMovement(classId, botCls, bot, player, aiState, now) {
  if (classId === 'sniper') return sniperMovement(botCls, bot, player);
  if (classId === 'assassino') return assassinoMovement(botCls, bot, player, aiState, now);
  if (Number.isFinite(botCls.range)) {
    const dxToPlayer = (player.x + PLAYER_SIZE / 2) - (bot.x + PLAYER_SIZE / 2);
    const preferredRange = preferredDistance(classId, botCls);
    return { left: dxToPlayer < preferredRange - 10, right: dxToPlayer > preferredRange + 10 };
  }
  // Alcance infinito (atirador): mantém-se no canto mais distante da arena.
  const desiredX = ARENA.w - 100 - PLAYER_SIZE;
  const dx = desiredX - bot.x;
  return { left: dx < -2, right: dx > 2 };
}

// Chamado quando o bot atira, para classes cuja estratégia reage ao próprio ataque.
export function markAttack(classId, aiState, now) {
  if (classId === 'assassino') aiState.retreatUntil = now + ASSASSINO_RETREAT_MS;
}

// Classes com só 1 carga de escudo (vidro) preferem desviar a arriscar a
// única chance de bloqueio; classes com escudo robusto usam-no à vontade.
export function classShieldChance(botCls, diff) {
  return botCls.shieldMaxHits <= 1 ? diff.shieldChance * 0.5 : diff.shieldChance;
}

export function classDodgeChance(botCls, diff) {
  return botCls.shieldMaxHits <= 1 ? Math.min(1, diff.dodgeChance * 1.2) : diff.dodgeChance;
}

// Acha o projétil do jogador que mais ameaça o bot agora, para as decisões
// de desvio/escudo. Funciona nos dois lados da arena: em vez de assumir que
// o atirador está sempre à esquerda do bot, compara o sinal de `vx` do
// projétil com o sinal da distância até o bot para confirmar que ele está
// mesmo se aproximando (e não apenas passando por perto, já afastando-se).
export function findIncomingThreat(bot, projectiles) {
  const cx = bot.x + PLAYER_SIZE / 2;
  const cy = bot.y + PLAYER_SIZE / 2;
  return projectiles.find((p) => {
    if (p.ownerIndex === 1) return false;
    if (Math.abs(p.y - cy) >= THREAT_Y_TOLERANCE_PX) return false;
    const dx = cx - p.x;
    if (dx !== 0 && Math.sign(dx) !== Math.sign(p.vx)) return false;
    return Math.abs(dx) < THREAT_LOOKAHEAD_PX;
  });
}

// Calcula o alvo do tiro do bot (com mira preditiva opcional e o espalhamento
// da dificuldade). Devolve também o ponto de origem (cx, cy) do disparo.
export function computeAimTarget(diff, bot, player, aiState) {
  const cx = bot.x + PLAYER_SIZE / 2;
  const cy = bot.y + PLAYER_SIZE / 2;
  let targetX = player.x + PLAYER_SIZE / 2;
  let targetY = player.y + PLAYER_SIZE / 2;

  if (diff.predictive && aiState.prevPlayerX !== null) {
    const velX = player.x - aiState.prevPlayerX;
    const velY = player.y - aiState.prevPlayerY;
    const travelTicks = Math.hypot(targetX - cx, targetY - cy) / PROJECTILE_SPEED;
    targetX += velX * travelTicks;
    targetY += velY * travelTicks;
  }

  targetX += (Math.random() - 0.5) * diff.aimSpread;
  targetY += (Math.random() - 0.5) * diff.aimSpread;
  return { cx, cy, targetX, targetY };
}
