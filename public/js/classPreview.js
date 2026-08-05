// Preview animado da classe selecionada na modal de seleção de classe do
// modo online: mostra o personagem (o mesmo sprite desenhado em partida por
// render.js, aqui animado por CSS — ver classSprite.js) atirando para a
// direita contra um boneco de treino, com os mesmos corações e escudos em
// miniatura do HUD (hud.js) para a classe atual.
//
// Os disparos reproduzem o comportamento real da classe em partida: cadência
// (shotCooldownMs), quantidade e leque de projéteis (projectileCount /
// coneSpreadDeg), tamanho relativo (projectileSize) e alcance (range) — só a
// velocidade visual de travessia da caixa é a mesma para todas as classes,
// porque PROJECTILE_SPEED é igual para todas em shared/constants.js.
import { createHeartsRow, createShieldsRow } from './hud.js';
import { applyClassSprite } from './classSprite.js';
import { getSpriteOffsetY, SPRITE_DISPLAY_SIZE } from './characterSprites.js';
import { getClass } from '../../shared/classes.js';
import { ARENA, PROJECTILE_SPEED, TICK_MS } from '../../shared/constants.js';

const PREVIEW_HEART_PIXEL = 1.6;
const PREVIEW_SHIELD_PIXEL = 1.6;

const OWN_SHOT_COLOR = '#facc15';
const PROJECTILE_SIZE_SCALE = 0.9;

const WORLD_SPEED_PX_MS = PROJECTILE_SPEED / TICK_MS;
// Tempo para atravessar uma largura de arena inteira, na velocidade real do
// jogo — igual para todas as classes, já que a velocidade do projétil não
// varia entre elas.
const FULL_WIDTH_FLIGHT_MS = ARENA.w / WORLD_SPEED_PX_MS;
// Distância (em px de mundo) do boneco de treino até o atirador. Fica abaixo
// do menor alcance entre as classes (assassino 240, tank 300, mago 320) para
// que o boneco sempre seja alcançado, não importa a classe selecionada.
const DUMMY_WORLD_DISTANCE = 220;

const TARGET_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></svg>';

// Mesma altura de quadro usada por `.class-preview-fighter.class-sprite` no
// CSS (`--sprite-box` * `--sprite-zoom`) — precisa ficar em sincronia com
// aquela regra, é o que converte o desvio vertical do canvas (SPRITE_OFFSET_Y
// em characterSprites.js, em px de exibição de 220x220) para o tamanho real
// do sprite aqui no preview.
const PREVIEW_SPRITE_BOX = 92;
const PREVIEW_SPRITE_ZOOM = 1.9;

export function createClassPreview(containerEl) {
  if (!containerEl) return { setClass() {}, stop() {} };

  containerEl.innerHTML = '';
  containerEl.classList.add('class-preview');

  const hearts = document.createElement('div');
  hearts.className = 'class-preview-hearts hearts';
  containerEl.appendChild(hearts);

  const shields = document.createElement('div');
  shields.className = 'class-preview-shields shields';
  containerEl.appendChild(shields);

  const character = document.createElement('div');
  character.className = 'class-preview-character';
  containerEl.appendChild(character);

  const fighter = document.createElement('div');
  fighter.className = 'class-preview-fighter';
  character.appendChild(fighter);

  // Espaçador com largura proporcional a DUMMY_WORLD_DISTANCE: mantém a
  // distância entre personagem e boneco fiel à escala do mundo, enquanto
  // `justify-content: center` em .class-preview-character centraliza o
  // conjunto (personagem + espaçador + boneco) horizontalmente na caixa.
  const spacer = document.createElement('div');
  spacer.className = 'class-preview-spacer';
  character.appendChild(spacer);

  const dummy = document.createElement('div');
  dummy.className = 'class-preview-dummy';
  dummy.innerHTML = TARGET_ICON;
  character.appendChild(dummy);

  let volleyTimer = null;
  let liveShots = [];
  let dummyResetId = null;
  let attackResetId = null;
  let currentClassId = null;

  // A linha do tiro fica na altura do centro geométrico do quadro do sprite
  // (`--sprite-anchor: 0.5` no CSS), que é o mesmo ponto (`cy`) usado por
  // render.js pra centralizar o sprite no canvas e de onde os projéteis
  // realmente saem. Assassino/sniper têm uma correção nesse centro
  // (`getSpriteOffsetY`, pose mais agachada/alongada) — sem repetir essa
  // mesma correção aqui, o tiro sairia um pouco acima do personagem só
  // nessas duas classes.
  function alignFighterToShot(classId) {
    const offsetPx = getSpriteOffsetY(classId) * (PREVIEW_SPRITE_BOX * PREVIEW_SPRITE_ZOOM) / SPRITE_DISPLAY_SIZE;
    fighter.style.setProperty('--sprite-shot-offset', `${offsetPx}px`);
  }

  // Toca a animação de ataque do sprite junto com o disparo e volta pro idle
  // quando ela termina — o mesmo vaivém que updateCharacterAnimator faz no
  // canvas, aqui só com um timer, já que quem anda os quadros é o CSS.
  function playAttack(classId) {
    const attack = applyClassSprite(fighter, classId, 'attack');
    if (!attack) return;
    clearTimeout(attackResetId);
    attackResetId = setTimeout(() => applyClassSprite(fighter, classId), attack.durationMs);
  }

  function clearShots() {
    for (const { el, timeoutId } of liveShots) {
      clearTimeout(timeoutId);
      el.remove();
    }
    liveShots = [];
  }

  function layoutRow() {
    const boxWidth = character.clientWidth || containerEl.clientWidth;
    if (!boxWidth) return;
    spacer.style.width = `${(DUMMY_WORLD_DISTANCE / ARENA.w) * boxWidth}px`;
  }

  // `spread` vai de -0.5 a 0.5 conforme a posição do projétil dentro do
  // leque (0 para tiro único) — usado para afastar horizontalmente os
  // indicadores de dano de disparos em cone (ex.: mago) que chegam juntos
  // no boneco, evitando que fiquem sobrepostos.
  function registerHit(damage, spread) {
    dummy.classList.remove('hit');
    void dummy.offsetWidth;
    dummy.classList.add('hit');
    clearTimeout(dummyResetId);
    dummyResetId = setTimeout(() => dummy.classList.remove('hit'), 300);

    const label = document.createElement('div');
    label.className = 'class-preview-damage';
    label.textContent = `-${damage}`;
    const stagger = spread * 34;
    label.style.left = `${dummy.offsetLeft + dummy.offsetWidth / 2 + stagger}px`;
    character.appendChild(label);
    setTimeout(() => label.remove(), 950);
  }

  function spawnVolley(cls) {
    const boxWidth = character.clientWidth || containerEl.clientWidth;
    if (!boxWidth) return;
    // O sprite é bem mais largo que o personagem desenhado nele, então o tiro
    // nasce perto do centro da caixa (onde está o corpo) e não na borda.
    const startLeft = fighter.offsetLeft + fighter.offsetWidth * 0.7;

    const count = Math.max(1, cls.projectileCount);
    const spreadRad = (cls.coneSpreadDeg * Math.PI) / 180;
    const finiteRange = Number.isFinite(cls.range) ? cls.range : Infinity;
    const hits = finiteRange >= DUMMY_WORLD_DISTANCE;
    const travelWorldPx = hits ? DUMMY_WORLD_DISTANCE : Math.min(finiteRange, ARENA.w);
    const flightMs = FULL_WIDTH_FLIGHT_MS * (travelWorldPx / ARENA.w);
    const dotSize = Math.max(3, cls.projectileSize * PROJECTILE_SIZE_SCALE);

    playAttack(cls.id);

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const angle = t * spreadRad;
      const dxWorld = Math.cos(angle) * travelWorldPx;
      const dyWorld = Math.sin(angle) * travelWorldPx;
      const dxPx = (dxWorld / ARENA.w) * boxWidth;
      const dyPx = (dyWorld / ARENA.w) * boxWidth;

      const el = document.createElement('div');
      el.className = 'class-preview-shot';
      el.style.left = `${startLeft}px`;
      el.style.width = `${dotSize}px`;
      el.style.height = `${dotSize}px`;
      el.style.background = OWN_SHOT_COLOR;
      el.style.setProperty('--shot-dx', `${dxPx}px`);
      el.style.setProperty('--shot-dy', `${dyPx}px`);
      el.style.animationDuration = `${flightMs}ms`;
      character.appendChild(el);
      // Força o navegador a aplicar o estado inicial antes de ligar a
      // animação, senão o disparo pode nascer já na posição final.
      void el.offsetWidth;
      el.classList.add('shooting');

      const timeoutId = setTimeout(() => {
        el.remove();
        liveShots = liveShots.filter((s) => s.el !== el);
        if (hits) registerHit(cls.damage, t);
      }, flightMs + 30);
      liveShots.push({ el, timeoutId });
    }
  }

  function setClass(classId) {
    const cls = getClass(classId);
    createHeartsRow(hearts, cls.maxLives, PREVIEW_HEART_PIXEL);
    createShieldsRow(shields, cls.shieldMaxHits, PREVIEW_SHIELD_PIXEL);
    currentClassId = cls.id;
    alignFighterToShot(cls.id);
    // Sem arte própria, o personagem continua sendo o quadrado colorido.
    if (!applyClassSprite(fighter, cls.id)) {
      fighter.classList.add('class-preview-square');
      fighter.style.background = cls.color;
    } else {
      fighter.classList.remove('class-preview-square');
      fighter.style.background = '';
    }
    layoutRow();

    if (volleyTimer) clearInterval(volleyTimer);
    clearTimeout(attackResetId);
    clearShots();
    spawnVolley(cls);
    volleyTimer = setInterval(() => spawnVolley(cls), cls.shotCooldownMs);
  }

  function stop() {
    if (volleyTimer) clearInterval(volleyTimer);
    volleyTimer = null;
    clearTimeout(dummyResetId);
    clearTimeout(attackResetId);
    // Volta pro idle: se a modal fechar no meio de um ataque, o sprite ficaria
    // travado no último quadro do golpe ao reabrir.
    if (currentClassId) applyClassSprite(fighter, currentClassId);
    clearShots();
  }

  return { setClass, stop };
}
