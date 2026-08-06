// Ícones flutuantes que sobem e desaparecem sobre a cabeça do jogador quando
// ele perde uma vida ou o escudo se quebra — reusa os mesmos padrões de pixel
// art do coração/escudo do HUD (hud.js) para manter a mesma estética, só que
// desenhados no canvas em cima do personagem em vez de em DOM.
import { ctx } from './dom.js';
import { state } from './state.js';
import { HEART_PIXELS, SHIELD_PIXELS } from './hud.js';

const ICON_PIXEL_SIZE = 3;
const ANIM_DURATION_MS = 900;
const RISE_DISTANCE = 30;
const TEXT_ICON_GAP = 4; // espaço entre o "-N" e o coração
// Mesmas cores do HUD real: coração cheio é vermelho (--cor-erro em
// style.css), escudo é azul (--cor-azul-escudo) — o ícone flutuante usa as
// mesmas cores para ficar reconhecível de relance.
const HEART_COLOR = '#e63946';
const SHIELD_COLOR = '#4aa8ff';
const CRACK_COLOR = '#0a2e4d';
const LOSS_FONT = 'bold 22px "Chakra Petch", sans-serif';

function drawPixelGrid(pixels, originX, originY, color) {
  ctx.fillStyle = color;
  for (const [row, col] of pixels) {
    ctx.fillRect(originX + col * ICON_PIXEL_SIZE, originY + row * ICON_PIXEL_SIZE, ICON_PIXEL_SIZE, ICON_PIXEL_SIZE);
  }
}

// Rachadura em ziguezague sobre o ícone, indicando que o escudo quebrou.
function drawCrack(originX, originY, width, height) {
  ctx.strokeStyle = CRACK_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(originX + width * 0.35, originY);
  ctx.lineTo(originX + width * 0.55, originY + height * 0.4);
  ctx.lineTo(originX + width * 0.4, originY + height * 0.55);
  ctx.lineTo(originX + width * 0.6, originY + height);
  ctx.stroke();
}

function spawn(type, x, topY, count) {
  state.floatingIcons.push({
    type, x, topY, count, startTime: Date.now(),
  });
}

// `x` é o centro horizontal e `topY` o topo da cabeça do personagem, em
// coordenadas de mundo (o mesmo espaço usado por drawPlayers em render.js).
// `count` é quantos corações inteiros foram perdidos nesse hit — aparece como
// texto ("-1", "-2"...) do lado do coração, em vez de repetir o ícone.
export function spawnFloatingHeartLoss(x, topY, count = 1) {
  spawn('heart', x, topY, count);
}

export function spawnFloatingShieldBreak(x, topY) {
  spawn('shield', x, topY, 1);
}

function drawIcon(icon, now) {
  const t = (now - icon.startTime) / ANIM_DURATION_MS;
  const alpha = 1 - t;
  const riseY = icon.topY - t * RISE_DISTANCE;

  const isHeart = icon.type === 'heart';
  const pixels = isHeart ? HEART_PIXELS : SHIELD_PIXELS;
  const width = 7 * ICON_PIXEL_SIZE;
  const height = (isHeart ? 6 : 8) * ICON_PIXEL_SIZE;
  const originY = riseY - height;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  // drawIcon roda dentro do ctx.scale(-1, 1) de espelhamento de visão
  // (render.js) quando state.viewFlipped — sem isso o texto "-N" e o coração
  // saem espelhados/ilegíveis pro jogador que nasceu do lado direito. Cancela
  // o flip só da forma desenhada, girando em torno de icon.x, que já está no
  // sistema de coordenadas espelhado e por isso continua caindo no lugar
  // certo na tela.
  if (state.viewFlipped) {
    ctx.translate(icon.x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-icon.x, 0);
  }

  if (isHeart) {
    const label = `-${icon.count}`;
    ctx.font = LOSS_FONT;
    ctx.fillStyle = HEART_COLOR;
    ctx.textBaseline = 'middle';
    const labelWidth = ctx.measureText(label).width;
    const totalWidth = labelWidth + TEXT_ICON_GAP + width;
    const originX = icon.x - totalWidth / 2;
    ctx.fillText(label, originX, originY + height / 2);
    drawPixelGrid(pixels, originX + labelWidth + TEXT_ICON_GAP, originY, HEART_COLOR);
  } else {
    const originX = icon.x - width / 2;
    drawPixelGrid(pixels, originX, originY, SHIELD_COLOR);
    drawCrack(originX, originY, width, height);
  }

  ctx.restore();
}

export function updateAndDrawFloatingIcons(now) {
  if (!state.floatingIcons.length) return;
  state.floatingIcons = state.floatingIcons.filter((icon) => now - icon.startTime < ANIM_DURATION_MS);
  for (const icon of state.floatingIcons) drawIcon(icon, now);
}
