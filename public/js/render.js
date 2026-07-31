import { ctx, canvas } from './dom.js';
import { state } from './state.js';
import { isShieldAvailable, hitFlashUntil } from './hud.js';
import { advancePrediction, getRenderState } from './prediction.js';
import { updateAndDrawExplosions } from './explosions.js';
import { showGameOverOverlay } from './gameOver.js';

const GAMEOVER_OVERLAY_DELAY = 2000;
const HIT_FLASH_DURATION = 400;

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

function drawPlayers(renderState, now) {
  for (let i = 0; i < renderState.players.length; i++) {
    let p = renderState.players[i];
    if (!p || !p.alive) continue;
    if (state.mode === 'online' && i === state.playerIndex && state.predicted.initialized) {
      p = { ...p, x: state.predicted.x, y: state.predicted.y };
    }

    const flashRemaining = hitFlashUntil[i] - now;
    let ox = 0;
    let oy = 0;
    if (flashRemaining > 0) {
      const t = 1 - flashRemaining / HIT_FLASH_DURATION;
      const flicker = Math.floor(t * 12) % 2 === 0;
      ctx.fillStyle = flicker ? '#ffffff' : state.colors[i];
      const shake = (1 - t) * 4;
      ox = (Math.random() - 0.5) * shake;
      oy = (Math.random() - 0.5) * shake;
    } else {
      ctx.fillStyle = state.colors[i];
    }
    ctx.fillRect(p.x + ox, p.y + oy, state.playerSize, state.playerSize);
    if (i === state.playerIndex) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + ox, p.y + oy, state.playerSize, state.playerSize);
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

function drawProjectiles(renderState) {
  for (const proj of renderState.projectiles) {
    const size = proj.size ?? state.projectileSize;
    ctx.fillStyle = state.colors[proj.ownerIndex];
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
      drawPlayers(renderState, now);
      drawProjectiles(renderState);
      updateAndDrawExplosions(now);
    }
  }

  requestAnimationFrame(render);
}
