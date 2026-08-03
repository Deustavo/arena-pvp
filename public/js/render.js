import { ctx, canvas } from './dom.js';
import { state, screenXToWorld } from './state.js';
import { isShieldAvailable, hitFlashUntil, updateCooldownBars } from './hud.js';
import { advancePrediction, getRenderState } from './prediction.js';
import { updateAndDrawExplosions } from './explosions.js';
import { showGameOverOverlay } from './gameOver.js';
import { getClass } from '../../shared/classes.js';

const GAMEOVER_OVERLAY_DELAY = 2000;
const HIT_FLASH_DURATION = 400;
const OWN_PLAYER_BORDER_COLOR = '#facc15';
const OWN_SHOT_COLOR = '#facc15';
const AIM_PREVIEW_COLOR = '#9ca3af';

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

function drawPlayers(renderState, now) {
  for (let i = 0; i < renderState.players.length; i++) {
    let p = renderState.players[i];
    if (!p || !p.alive) continue;
    if (state.mode === 'online' && i === state.playerIndex && state.predicted.initialized) {
      p = { ...p, x: state.predicted.x, y: state.predicted.y };
    }

    const classColor = getClass(p.classId).color;

    if (i === state.playerIndex && state.matchStarted && !state.input.shield) {
      drawShotPreview(p.x + state.playerSize / 2, p.y + state.playerSize / 2, p.classId);
    }

    const flashRemaining = hitFlashUntil[i] - now;
    let ox = 0;
    let oy = 0;
    if (flashRemaining > 0) {
      const t = 1 - flashRemaining / HIT_FLASH_DURATION;
      const flicker = Math.floor(t * 12) % 2 === 0;
      ctx.fillStyle = flicker ? '#ffffff' : classColor;
      const shake = (1 - t) * 4;
      ox = (Math.random() - 0.5) * shake;
      oy = (Math.random() - 0.5) * shake;
    } else {
      ctx.fillStyle = classColor;
    }
    ctx.fillRect(p.x + ox, p.y + oy, state.playerSize, state.playerSize);
    if (i === state.playerIndex) {
      ctx.strokeStyle = OWN_PLAYER_BORDER_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + ox, p.y + oy, state.playerSize, state.playerSize);
      if (!state.matchStarted) {
        drawPlayerIndicatorArrow(p.x + ox + state.playerSize / 2, p.y + oy, now);
      }
    }

    const shieldingNow = i === state.playerIndex
      ? (state.input.shield && isShieldAvailable())
      : !!p.shielding;
    if (shieldingNow) {
      const maxHits = p.shieldMaxHits ?? state.shieldMaxHits[i];
      drawShield(p.x + ox + state.playerSize / 2, p.y + oy + state.playerSize / 2,
        maxHits - (p.shieldHits || 0), maxHits, now);
    }
  }
}

// Decide se a cena deve ser espelhada nesta frame: verdadeiro quando o
// jogador local está fisicamente à direita do adversário na arena.
function computeViewFlip(renderState) {
  if (state.playerIndex === null) return false;
  const oppIndex = state.playerIndex === 0 ? 1 : 0;
  let me = renderState.players[state.playerIndex];
  const opp = renderState.players[oppIndex];
  if (!me || !opp) return false;
  if (state.mode === 'online' && state.predicted.initialized) me = { ...me, x: state.predicted.x };
  return me.x > opp.x;
}

function drawProjectiles(renderState) {
  for (const proj of renderState.projectiles) {
    const size = proj.size ?? state.projectileSize;
    const owner = renderState.players[proj.ownerIndex];
    if (proj.ownerIndex === state.playerIndex) {
      ctx.fillStyle = OWN_SHOT_COLOR;
    } else {
      ctx.fillStyle = owner ? getClass(owner.classId).color : '#ffffff';
    }
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.mode) {
    const now = Date.now();

    if (state.gameOver && state.gameOverAt && now - state.gameOverAt >= GAMEOVER_OVERLAY_DELAY) {
      if (!state.overlayShown) showGameOverOverlay();
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      if (state.mode === 'online') advancePrediction();
      const renderState = getRenderState();
      state.viewFlipped = computeViewFlip(renderState);

      ctx.save();
      if (state.viewFlipped) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      drawPlayers(renderState, now);
      drawProjectiles(renderState);
      updateAndDrawExplosions(now);
      ctx.restore();

      updateCooldownBars(now);
    }
  }

  requestAnimationFrame(render);
}
