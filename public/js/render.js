import { ctx, canvas } from './dom.js';
import { state, screenXToWorld } from './state.js';
import { isShieldAvailable, hitFlashUntil, updateCooldownBars } from './hud.js';
import { advancePrediction, getRenderState } from './prediction.js';
import { updateAndDrawExplosions } from './explosions.js';
import { updateAndDrawFloatingIcons } from './floatingIcons.js';
import { checkNearMiss } from './nearMiss.js';
import { drawPowerupZone, updateAndDrawPowerups, drawPowerupPickups } from './powerups.js';
import {
  drawArenaBackground as drawArenaTerrain, terremotoShakeOffset, updateAndDrawVento, updateAndDrawErupcoes,
} from './arenaVisuals.js';
import { showGameOverOverlay } from './gameOver.js';
import { getClass } from '../../shared/classes.js';
import {
  hasCharacterSprite, updateCharacterAnimator, drawCharacterFrame, getSpriteOffsetY,
} from './characterSprites.js';
import { PX, snap, pxCirculo, pxAnel } from './pixel.js';

const GAMEOVER_OVERLAY_DELAY = 2000;
const HIT_FLASH_DURATION = 400;
const OWN_PLAYER_BORDER_COLOR = '#facc15';
const OWN_SHOT_COLOR = '#facc15';
const ENEMY_SHOT_COLOR = '#ff4d4d';
// Rastro do projétil: dois degraus escurecidos da própria cor do tiro (o
// primeiro bloco atrás dele, e um mais apagado atrás desse). Brilho no miolo.
const OWN_SHOT_TRAIL_1 = '#c79f14';
const OWN_SHOT_TRAIL_2 = '#7a5c0a';
const ENEMY_SHOT_TRAIL_1 = '#c23a3a';
const ENEMY_SHOT_TRAIL_2 = '#752020';
const SHOT_CORE_COLOR = '#fff7c2';
const AIM_PREVIEW_COLOR = '#9ca3af';
const HITBOX_DEBUG_COLOR = '#22ff22';

// Personagem sob efeito de power-up pisca na cor do buff: amarelo para
// cadência, branco para velocidade (as mesmas cores da bolha, ver
// public/js/powerups.js). Com os dois ativos, alterna entre as duas — assim
// nenhum dos efeitos fica invisível.
const POWERUP_GLOW = {
  cadencia: '#facc15',
  velocidade: '#ffffff',
};
const POWERUP_GLOW_BLUR = 22;
const POWERUP_BLINK_MS = 160;
// Cada cor fica um tempo maior que uma piscada antes de dar lugar à outra,
// senão as duas viram um piscar único de cor indefinida.
const POWERUP_COR_ALTERNA_MS = 640;

// `null` quando nenhum buff está ativo, ou quando é o meio-tempo "apagado" da
// piscada. `buffs` vem do snapshot em milissegundos restantes (ver
// buffsRestantes em shared/powerups.js), então não depende do relógio local.
function powerupGlow(player, now) {
  const buffs = player.buffs;
  if (!buffs) return null;
  const cores = [];
  if (buffs.cadenciaMs > 0) cores.push(POWERUP_GLOW.cadencia);
  if (buffs.velocidadeMs > 0) cores.push(POWERUP_GLOW.velocidade);
  if (!cores.length) return null;
  if (Math.floor(now / POWERUP_BLINK_MS) % 2 !== 0) return null;
  const cor = cores[Math.floor(now / POWERUP_COR_ALTERNA_MS) % cores.length];
  return { color: cor, blur: POWERUP_GLOW_BLUR };
}

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
// Modo espectador: borda amarela em vez de vermelha, o mesmo aviso visual de
// "isso não é a sua partida" que o banner "Assistindo" já dá em texto.
const ARENA_BORDER_COLOR_SPECTATOR = '#facc15';
const ARENA_BORDER_WIDTH = 4;
// Bisel da borda: a faixa de fora é mais escura que a de dentro, o mesmo
// truque de dois tons que dá volume ao botão de pedra no CSS. Uma borda de
// cor chapada lê como uma linha desenhada por cima; com o bisel, a arena
// parece ter parede.
const ARENA_BORDER_SHADE = {
  '#8b0000': '#5a0000',
  '#facc15': '#a37f00',
};

// Desenhada por último e sempre, mesmo no fim de partida (que pinta o canvas
// inteiro por cima). O inset de metade da espessura mantém o traço todo dentro
// do canvas, sem meia borda cortada.
function drawArenaBorder() {
  const cor = state.mode === 'spectator' ? ARENA_BORDER_COLOR_SPECTATOR : ARENA_BORDER_COLOR;
  const w = ARENA_BORDER_WIDTH;
  ctx.save();
  // Duas molduras de faixas cheias em vez de um traço: a de fora escura, a de
  // dentro na cor da borda. Preencher o canvas e recortar o miolo apagaria a
  // partida — esta é a última coisa desenhada no frame.
  drawMoldura(0, ARENA_BORDER_SHADE[cor] || cor, w);
  drawMoldura(w, cor, w);
  ctx.restore();
}

// Moldura de `espessura` px encostada `inset` px para dentro das bordas do
// canvas, feita de quatro faixas.
function drawMoldura(inset, cor, espessura) {
  const w = canvas.width - inset * 2;
  const h = canvas.height - inset * 2;
  ctx.fillStyle = cor;
  ctx.fillRect(inset, inset, w, espessura);
  ctx.fillRect(inset, inset + h - espessura, w, espessura);
  ctx.fillRect(inset, inset, espessura, h);
  ctx.fillRect(inset + w - espessura, inset, espessura, h);
}

const SHIELD_COLOR = '#7dd3fc';
const SHIELD_FILL = 'rgba(125, 211, 252, 0.16)';

function drawShield(cx, cy, charges, maxHits, now) {
  if (charges <= 0) return;
  // A pulsação é de um bloco inteiro, alternando, em vez de uma senoide de
  // 3% que só serviria para reamostrar o anel a cada frame.
  const r = state.shieldRadius + (Math.floor(now / 400) % 2 ? PX : 0);

  ctx.save();
  pxCirculo(ctx, cx, cy, r - PX, SHIELD_FILL);

  const gap = 0.18;
  const step = (Math.PI * 2) / maxHits;
  for (let i = 0; i < charges; i++) {
    const start = -Math.PI / 2 + i * step + gap / 2;
    pxAnel(ctx, cx, cy, r, PX, SHIELD_COLOR, start, start + step - gap);
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

  // Exceção deliberada à pixel art (ver CLAUDE.md): traço fino tracejado. A
  // versão em blocos foi tentada e ficou ruim — a mira é uma linha de leitura,
  // não arte, e em blocos ela some contra o chão texturizado.
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
  // Meia-lua em blocos: uma faixa aos pés e um bloco subindo em cada ponta.
  // O pulso alterna entre dois tamanhos inteiros, no lugar da senoide.
  const meia = (Math.floor(now / 300) % 2 ? 5 : 4) * PX;
  const x = snap(cx);
  const y = snap(feetY);
  ctx.save();
  ctx.fillStyle = OWN_PLAYER_BORDER_COLOR;
  ctx.fillRect(x - meia, y, meia * 2, PX);
  ctx.fillRect(x - meia - PX, y - PX, PX, PX);
  ctx.fillRect(x + meia, y - PX, PX, PX);
  ctx.restore();
}

// Seta amarela que aponta para o quadrado do jogador controlado por este
// cliente, exibida só no começo da partida (antes do contador acabar) para
// ajudar a identificar qual dos dois é o "você".
function drawPlayerIndicatorArrow(cx, topY, now) {
  // Ponta triangular em três degraus + haste, tudo em blocos. O balanço anda
  // em passos de um bloco (3 posições) em vez de uma senoide contínua.
  const bounce = (Math.floor(now / 220) % 3) * PX;
  const x = snap(cx);
  const tipY = snap(topY - PX * 3) + bounce;

  ctx.save();
  ctx.fillStyle = OWN_PLAYER_BORDER_COLOR;
  ctx.fillRect(x - PX / 2, tipY, PX, PX);
  ctx.fillRect(x - PX * 1.5, tipY - PX, PX * 3, PX);
  ctx.fillRect(x - PX * 2.5, tipY - PX * 2, PX * 5, PX);
  ctx.fillRect(x - PX * 1.5, tipY - PX * 5, PX * 3, PX * 3);
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
      // Em pixels inteiros: meio pixel de tremida reamostra o sprite e o
      // personagem fica borrado justamente no frame do dano.
      ox = Math.round((Math.random() - 0.5) * shake);
      oy = Math.round((Math.random() - 0.5) * shake);
    }

    // O sprite é desenhado sempre em coordenada inteira, pelo mesmo motivo:
    // a posição vem da física em ponto flutuante, e a arte não pode cair
    // entre dois pixels de tela.
    const cx = Math.round(p.x + ox + state.playerSize / 2);
    const cy = Math.round(p.y + oy + state.playerSize / 2);
    // Piscada de power-up ativo. Vale para os dois jogadores, nos três modos:
    // sai do snapshot, não do input local.
    const glow = p.alive ? powerupGlow(p, now) : null;
    if (sprite) {
      if (!drawCharacterFrame(ctx, sprite, cx, cy + getSpriteOffsetY(p.classId), undefined, glow)) {
        ctx.fillStyle = glow ? glow.color : cls.color;
        ctx.fillRect(p.x + ox, p.y + oy, state.playerSize, state.playerSize);
      }
    } else {
      if (flashRemaining > 0) {
        const t = 1 - flashRemaining / HIT_FLASH_DURATION;
        const flicker = Math.floor(t * 12) % 2 === 0;
        ctx.fillStyle = flicker ? '#ffffff' : cls.color;
      } else {
        // Sem sprite não há silhueta para brilhar em volta: o quadrado pisca
        // direto na cor do buff.
        ctx.fillStyle = glow ? glow.color : cls.color;
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
    const proprio = proj.ownerIndex === ownColorIndex;
    const cor = proprio ? OWN_SHOT_COLOR : ENEMY_SHOT_COLOR;
    const x = snap(proj.x);
    const y = snap(proj.y);

    // Rastro: dois blocos atrás do tiro, esmaecendo em degraus na direção
    // contrária ao movimento. É o que faz um projétil de poucos pixels
    // continuar legível em movimento — muito mais que aumentar o tamanho.
    const dir = Math.sign(proj.vx || 0);
    if (dir) {
      ctx.fillStyle = proprio ? OWN_SHOT_TRAIL_2 : ENEMY_SHOT_TRAIL_2;
      ctx.fillRect(x - dir * PX * 4, y, PX * 2, PX);
      ctx.fillStyle = proprio ? OWN_SHOT_TRAIL_1 : ENEMY_SHOT_TRAIL_1;
      ctx.fillRect(x - dir * PX * 2, y, PX * 2, PX);
    }

    // Corpo do tiro: um bloco quadrado dimensionado pelo tamanho real do
    // projétil (o mago tem projétil menor que o tanque), com um pixel claro
    // no meio como brilho.
    const blocos = Math.max(1, Math.round(size / PX));
    const lado = blocos * PX;
    ctx.fillStyle = cor;
    ctx.fillRect(x - lado / 2, y - lado / 2, lado, lado);
    if (blocos >= 2) {
      ctx.fillStyle = SHOT_CORE_COLOR;
      ctx.fillRect(x - PX / 2, y - PX / 2, PX, PX);
    }
  }
}

export function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Tremor de terremoto (arena de terra): desloca a cena inteira por um
  // frame, incluindo fundo e borda — é a câmera que treme, não o mundo.
  ctx.save();
  const shake = terremotoShakeOffset(Date.now());
  if (shake) ctx.translate(shake.x, shake.y);

  drawArenaTerrain(ARENA_BG_COLOR);

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
      // Zona de spawn primeiro: é fundo, fica por baixo de jogadores e tiros.
      drawPowerupZone();
      updateAndDrawVento(now);
      updateAndDrawPowerups(now);
      drawPlayers(renderState, now);
      drawPowerupPickups(now);
      drawProjectiles(renderState);
      updateAndDrawErupcoes(now);
      updateAndDrawExplosions(now);
      updateAndDrawFloatingIcons(now);
      ctx.restore();

      updateCooldownBars(now);
    }
  }

  drawArenaBorder();
  ctx.restore();

  requestAnimationFrame(render);
}
