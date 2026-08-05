// Sprites animados por classe. Hoje só o atirador tem arte própria — as
// demais classes continuam desenhadas como quadrado colorido em render.js
// (hasCharacterSprite retorna false pra elas e o fallback antigo se aplica).
//
// Cada spritesheet é uma tira horizontal de quadros FRAME_SIZE x FRAME_SIZE.
// `loop: false` marca animações de um tiro só (ataque/dano/morte): ao chegar
// no último quadro elas travam nele (`finished = true`) em vez de voltar ao
// início, e é isso que faz updateCharacterAnimator devolver o personagem pra
// idle/walk sozinho.
const FRAME_SIZE = 100;
export const SPRITE_DISPLAY_SIZE = 220;

const SPRITE_SHEETS = {
  atirador: {
    idle: { src: '/assets/sprites/atirador/idle.png', frames: 6, frameMs: 150, loop: true },
    walk: { src: '/assets/sprites/atirador/walk.png', frames: 8, frameMs: 90, loop: true },
    attack: { src: '/assets/sprites/atirador/attack.png', frames: 9, frameMs: 55, loop: false },
    hurt: { src: '/assets/sprites/atirador/hurt.png', frames: 4, frameMs: 80, loop: false },
    death: { src: '/assets/sprites/atirador/death.png', frames: 4, frameMs: 120, loop: false },
  },
};

// state.js importa este módulo (pra resetar o animador em resetMatchState) e
// é testado direto em Node, sem DOM — `typeof Image` protege esse import de
// quebrar fora do browser.
const hasDom = typeof Image !== 'undefined';

const imageCache = new Map();
function loadImage(src) {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  return img;
}

// Pré-carrega tudo já na importação do módulo, pra não ter pop-in de quadro
// vazio no primeiro tiro/dano da partida.
if (hasDom) {
  for (const sheets of Object.values(SPRITE_SHEETS)) {
    for (const sheet of Object.values(sheets)) loadImage(sheet.src);
  }
}

export function hasCharacterSprite(classId) {
  return !!SPRITE_SHEETS[classId];
}

// Abaixo disso por quadro conta como "parado" — evita que jitter de rede
// (posição interpolada oscilando por frações de pixel) vire animação de
// andar piscando.
const MOVE_EPSILON_PER_MS = 0.02;

function createAnimatorState() {
  return {
    anim: 'idle',
    frame: 0,
    frameElapsedMs: 0,
    finished: false,
    facing: 1,
    prevX: null,
    prevY: null,
    prevLastShot: null,
    prevHitFlashUntil: 0,
  };
}

// Um slot por posição visual do HUD (0/1), não por playerIndex de rede —
// mesma convenção do resto do cliente (hitFlashUntil em hud.js, etc.).
let animators = [createAnimatorState(), createAnimatorState()];

// Chamado ao (re)começar uma partida, pra um personagem não herdar a
// animação/posição da partida anterior.
export function resetCharacterAnimators() {
  animators = [createAnimatorState(), createAnimatorState()];
}

// `hitFlashUntil` é o mesmo array que render.js já usa pro flash de dano do
// quadrado (hud.js) — comparar contra o valor do quadro anterior é como
// detectamos a borda de "acabou de tomar dano" sem duplicar essa lógica.
export function updateCharacterAnimator(slot, classId, player, hitFlashUntilForSlot, nowMs, dtMs) {
  const sheets = SPRITE_SHEETS[classId];
  if (!sheets) return null;
  const st = animators[slot];

  const dx = st.prevX === null ? 0 : player.x - st.prevX;
  const dy = st.prevY === null ? 0 : player.y - st.prevY;
  const moving = dtMs > 0 && Math.hypot(dx, dy) / dtMs > MOVE_EPSILON_PER_MS;
  if (Math.abs(dx) > 0.01) st.facing = dx > 0 ? 1 : -1;

  const justHurt = st.prevHitFlashUntil !== hitFlashUntilForSlot && hitFlashUntilForSlot > nowMs;
  const justShot = st.prevLastShot !== null && player.lastShot && player.lastShot !== st.prevLastShot;
  st.prevX = player.x;
  st.prevY = player.y;
  st.prevHitFlashUntil = hitFlashUntilForSlot;
  st.prevLastShot = player.lastShot ?? st.prevLastShot;

  // Prioridade: morte > dano > tiro > movimento. Uma animação de um tiro só
  // (loop: false) em andamento (`!st.finished`) segura a prioridade dela até
  // terminar, pra um dano não cortar o ataque no meio nem o inverso.
  let target;
  if (!player.alive) target = 'death';
  else if (justHurt) target = 'hurt';
  else if (st.anim === 'hurt' && !st.finished) target = 'hurt';
  else if (justShot) target = 'attack';
  else if (st.anim === 'attack' && !st.finished) target = 'attack';
  else target = moving ? 'walk' : 'idle';

  if (target !== st.anim) {
    st.anim = target;
    st.frame = 0;
    st.frameElapsedMs = 0;
    st.finished = false;
  }

  const sheet = sheets[st.anim];
  if (!st.finished) {
    st.frameElapsedMs += dtMs;
    while (st.frameElapsedMs >= sheet.frameMs) {
      st.frameElapsedMs -= sheet.frameMs;
      st.frame++;
      if (st.frame >= sheet.frames) {
        if (sheet.loop) {
          st.frame = 0;
        } else {
          st.frame = sheet.frames - 1;
          st.finished = true;
          st.frameElapsedMs = 0;
          break;
        }
      }
    }
  }

  return {
    image: loadImage(sheet.src),
    frame: st.frame,
    facing: st.facing,
    isDeathFinished: st.anim === 'death' && st.finished,
  };
}

// Desenha o quadro atual centralizado em (cx, cy) — o centro do hitbox do
// jogador, não o canto. `facing` espelha o desenho (a arte olha pra um lado
// só); o espelhamento de state.viewFlipped já é aplicado por fora, no
// ctx.save()/scale(-1,1) que envolve drawPlayers inteiro em render.js, então
// aqui só cuida da direção de movimento em espaço de mundo.
export function drawCharacterFrame(ctx, sprite, cx, cy, size = SPRITE_DISPLAY_SIZE) {
  if (!sprite || !sprite.image.complete || sprite.image.naturalWidth === 0) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx, cy);
  if (sprite.facing < 0) ctx.scale(-1, 1);
  ctx.drawImage(
    sprite.image,
    sprite.frame * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
    -size / 2, -size / 2, size, size,
  );
  ctx.restore();
  return true;
}
