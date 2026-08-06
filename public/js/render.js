import { ctx, canvas } from './dom.js';
import { state, screenXToWorld } from './state.js';
import { isShieldAvailable, hitFlashUntil, updateCooldownBars } from './hud.js';
import { advancePrediction, getRenderState } from './prediction.js';
import { updateAndDrawExplosions } from './explosions.js';
import { updateAndDrawFloatingIcons } from './floatingIcons.js';
import { checkNearMiss } from './nearMiss.js';
import { showGameOverOverlay } from './gameOver.js';
import { getClass } from '../../shared/classes.js';
import {
  hasCharacterSprite, updateCharacterAnimator, drawCharacterFrame, getSpriteOffsetY,
} from './characterSprites.js';

const GAMEOVER_OVERLAY_DELAY = 2000;
const HIT_FLASH_DURATION = 400;
const OWN_PLAYER_BORDER_COLOR = '#facc15';
const OWN_SHOT_COLOR = '#facc15';
const ENEMY_SHOT_COLOR = '#ff4d4d';
const AIM_PREVIEW_COLOR = '#9ca3af';
const HITBOX_DEBUG_COLOR = '#22ff22';

// Debug visual da caixa de colisão real de cada jogador (o mesmo retângulo
// usado por rectsIntersect em shared/physics.js), ativado por `?debug=1` na
// URL — não deve rodar em produção sem o parâmetro explícito.
const HITBOX_DEBUG = new URLSearchParams(location.search).get('debug') === '1';

// Fundo e borda da arena são desenhados dentro do canvas, e não via CSS: o
// #game-wrap inteiro recebe um transform: scale() menor que 1 (gameScale.js)
// para caber na tela, e uma borda CSS fina acabava reduzida a uma fração de
// pixel de tela, virando um cinza quase invisível dependendo do tamanho da
// janela. Desenhada em pixels de canvas ela escala junto com a arena e nunca
// desaparece.
const ARENA_BG_COLOR = '#3a3a3a';
const ARENA_BORDER_COLOR = '#8b0000';
const ARENA_BORDER_WIDTH = 4;

function drawArenaBackground() {
  ctx.fillStyle = ARENA_BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Desenhada por último e sempre, mesmo no fim de partida (que pinta o canvas
// inteiro por cima). O inset de metade da espessura mantém o traço todo dentro
// do canvas, sem meia borda cortada.
function drawArenaBorder() {
  const inset = ARENA_BORDER_WIDTH / 2;
  ctx.save();
  ctx.strokeStyle = ARENA_BORDER_COLOR;
  ctx.lineWidth = ARENA_BORDER_WIDTH;
  ctx.strokeRect(inset, inset, canvas.width - ARENA_BORDER_WIDTH, canvas.height - ARENA_BORDER_WIDTH);
  ctx.restore();
}

function drawShield(cx, cy, charges, maxHits, now) {
  if (charges <= 0) return;
  const pulse = 1 + Math.sin(now / 120) * 0.03;
  const r = state.shieldRadius * pulse;

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#7dd3fc';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 3;
  const gap = 0.18;
  const step = (Math.PI * 2) / maxHits;
  for (let i = 0; i < charges; i++) {
    const start = -Math.PI / 2 + i * step + gap / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + step - gap);
    ctx.stroke();
  }
  ctx.restore();
}

// Comprimento usado para "infinito": maior que qualquer diagonal possível da
// arena, o suficiente para o traço sair da tela em qualquer direção — o
// canvas recorta o resto automaticamente.
const INFINITE_PREVIEW_LENGTH = 2000;

// Desenha exatamente a trajetória que createShotProjectiles vai gerar ao
// clicar na posição atual do mouse: mesma direção base, mesmo leque em cone
// e mesmo alcance da classe do jogador.
function drawShotPreview(cx, cy, classId) {
  const cls = getClass(classId);
  const dx = screenXToWorld(state.mouse.x) - cx;
  const dy = state.mouse.y - cy;
  const baseAngle = Math.atan2(dy, dx);
  const count = Math.max(1, cls.projectileCount);
  const spreadRad = (cls.coneSpreadDeg * Math.PI) / 180;
  const length = Number.isFinite(cls.range) ? cls.range : INFINITE_PREVIEW_LENGTH;

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = AIM_PREVIEW_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = baseAngle + t * spreadRad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.restore();
}

// Indica o jogador controlado por este cliente sem cobrir o personagem: uma
// meia-lua pulsante no chão, aos pés (só a metade de baixo da elipse, pra não
// virar um anel fechado competindo com o desenho) — a borda amarela ao redor
// do sprite/quadrado antes usada atrapalhava a visualização do personagem.
function drawOwnPlayerMarker(cx, feetY, now) {
  const pulse = 1 + Math.sin(now / 300) * 0.12;
  ctx.save();
  ctx.strokeStyle = OWN_PLAYER_BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.ellipse(cx, feetY, 15 * pulse, 5 * pulse, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

// Seta amarela que aponta para o quadrado do jogador controlado por este
// cliente, exibida só no começo da partida (antes do contador acabar) para
// ajudar a identificar qual dos dois é o "você".
function drawPlayerIndicatorArrow(cx, topY, now) {
  const bounce = Math.sin(now / 200) * 5;
  const tipY = topY - 10 + bounce; // ponta, mais próxima do jogador
  const headWidth = 16;
  const headHeight = 10;
  const shaftWidth = 6;
  const shaftHeight = 12;

  ctx.save();
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.lineTo(cx - headWidth / 2, tipY - headHeight);
  ctx.lineTo(cx - shaftWidth / 2, tipY - headHeight);
  ctx.lineTo(cx - shaftWidth / 2, tipY - headHeight - shaftHeight);
  ctx.lineTo(cx + shaftWidth / 2, tipY - headHeight - shaftHeight);
  ctx.lineTo(cx + shaftWidth / 2, tipY - headHeight);
  ctx.lineTo(cx + headWidth / 2, tipY - headHeight);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// dt próprio da animação de sprite, independente do performance.now() usado
// pela predição (que só corre com a predição inicializada) — assim os
// personagens continuam animando (ex.: morte) mesmo fora do modo online.
let lastSpriteFrameMs = null;

function drawPlayers(renderState, now) {
  const nowMs = performance.now();
  const dtMs = lastSpriteFrameMs === null ? 0 : nowMs - lastSpriteFrameMs;
  lastSpriteFrameMs = nowMs;

  for (let i = 0; i < renderState.players.length; i++) {
    let p = renderState.players[i];
    if (!p) continue;
    if (state.mode === 'online' && i === state.playerIndex && state.predicted.initialized) {
      p = { ...p, x: state.predicted.x, y: state.predicted.y };
    }
    // Direção do próprio jogador é aplicada direto do mouse local, sem
    // esperar o round-trip do servidor — senão o personagem giraria com
    // o mesmo atraso da predição/interpolação de rede.
    if (i === state.playerIndex) {
      p = { ...p, facing: state.facing };
    }

    const cls = getClass(p.classId);
    const sprite = hasCharacterSprite(p.classId)
      ? updateCharacterAnimator(i, p.classId, p, hitFlashUntil[i], nowMs, dtMs)
      : null;

    // Sem sprite, jogador morto some na hora (comportamento antigo, a
    // explosão de partículas já cobre o efeito). Com sprite, deixa a
    // animação de morte terminar antes de sumir de vez.
    if (!p.alive && (!sprite || sprite.isDeathFinished)) continue;

    // A prévia de mira some no desempate: a partida está congelada e ninguém
    // atira mais.
    if (p.alive && i === state.playerIndex && state.matchStarted && !state.desempate && !state.input.shield) {
      drawShotPreview(p.x + state.playerSize / 2, p.y + state.playerSize / 2, p.classId);
    }

    const flashRemaining = hitFlashUntil[i] - now;
    let ox = 0;
    let oy = 0;
    if (flashRemaining > 0) {
      const t = 1 - flashRemaining / HIT_FLASH_DURATION;
      const shake = (1 - t) * 4;
      ox = (Math.random() - 0.5) * shake;
      oy = (Math.random() - 0.5) * shake;
    }

    const cx = p.x + ox + state.playerSize / 2;
    const cy = p.y + oy + state.playerSize / 2;
    if (sprite) {
      if (!drawCharacterFrame(ctx, sprite, cx, cy + getSpriteOffsetY(p.classId))) {
        ctx.fillStyle = cls.color;
        ctx.fillRect(p.x + ox, p.y + oy, state.playerSize, state.playerSize);
      }
    } else {
      if (flashRemaining > 0) {
        const t = 1 - flashRemaining / HIT_FLASH_DURATION;
        const flicker = Math.floor(t * 12) % 2 === 0;
        ctx.fillStyle = flicker ? '#ffffff' : cls.color;
      } else {
        ctx.fillStyle = cls.color;
      }
      ctx.fillRect(p.x + ox, p.y + oy, state.playerSize, state.playerSize);
    }

    if (HITBOX_DEBUG) drawHitbox(p.x, p.y);

    if (!p.alive) continue;

    if (i === state.playerIndex) {
      drawOwnPlayerMarker(cx, p.y + oy + state.playerSize + 4, now);
      if (!state.matchStarted) {
        drawPlayerIndicatorArrow(cx, p.y + oy, now);
      }
    }

    const shieldingNow = i === state.playerIndex
      ? (state.input.shield && isShieldAvailable())
      : !!p.shielding;
    if (shieldingNow) {
      const maxHits = p.shieldMaxHits ?? state.shieldMaxHits[i];
      drawShield(cx, cy, maxHits - (p.shieldHits || 0), maxHits, now);
    }
  }
}

function drawHitbox(x, y) {
  ctx.save();
  ctx.strokeStyle = HITBOX_DEBUG_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, state.playerSize, state.playerSize);
  ctx.restore();
}

function drawProjectiles(renderState) {
  // Sem jogador local (espectador, `playerIndex` null) não existe "meu tiro":
  // colore por dono de forma estável (slot 0 = amarelo, slot 1 = vermelho),
  // só pra diferenciar visualmente os dois lados.
  const ownColorIndex = state.playerIndex ?? 0;
  for (const proj of renderState.projectiles) {
    const size = proj.size ?? state.projectileSize;
    if (proj.ownerIndex === ownColorIndex) {
      ctx.fillStyle = OWN_SHOT_COLOR;
    } else {
      ctx.fillStyle = ENEMY_SHOT_COLOR;
    }
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawArenaBackground();

  if (state.mode) {
    const now = Date.now();

    if (state.gameOver && state.gameOverAt && now - state.gameOverAt >= GAMEOVER_OVERLAY_DELAY) {
      if (!state.overlayShown) showGameOverOverlay();
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      if (state.mode === 'online') advancePrediction();
      const renderState = getRenderState();
      checkNearMiss(renderState, now);

      // state.viewFlipped é decidido uma única vez no início da partida (ver
      // network.js/bot.js) com base na posição inicial dos jogadores — não é
      // recalculado a cada frame, senão a tela inverteria toda vez que os
      // jogadores se cruzassem, o que é muito confuso.
      ctx.save();
      if (state.viewFlipped) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      drawPlayers(renderState, now);
      drawProjectiles(renderState);
      updateAndDrawExplosions(now);
      updateAndDrawFloatingIcons(now);
      ctx.restore();

      updateCooldownBars(now);
    }
  }

  drawArenaBorder();

  requestAnimationFrame(render);
}
