// Preview animado da classe selecionada na modal de seleção de classe do
// modo online: mostra o "personagem" (quadrado colorido igual ao desenhado
// em partida por render.js) parado, atirando para a direita contra um
// boneco de treino, com os mesmos corações e escudos em miniatura do HUD
// (hud.js) para a classe atual.
//
// Os disparos reproduzem o comportamento real da classe em partida: cadência
// (shotCooldownMs), quantidade e leque de projéteis (projectileCount /
// coneSpreadDeg), tamanho relativo (projectileSize) e alcance (range) — só a
// velocidade visual de travessia da caixa é a mesma para todas as classes,
// porque PROJECTILE_SPEED é igual para todas em shared/constants.js.
import { createHeartsRow, createShieldsRow } from './hud.js';
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

  const square = document.createElement('div');
  square.className = 'class-preview-square';
  character.appendChild(square);

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
    const startLeft = square.offsetLeft + square.offsetWidth;

    const count = Math.max(1, cls.projectileCount);
    const spreadRad = (cls.coneSpreadDeg * Math.PI) / 180;
    const finiteRange = Number.isFinite(cls.range) ? cls.range : Infinity;
    const hits = finiteRange >= DUMMY_WORLD_DISTANCE;
    const travelWorldPx = hits ? DUMMY_WORLD_DISTANCE : Math.min(finiteRange, ARENA.w);
    const flightMs = FULL_WIDTH_FLIGHT_MS * (travelWorldPx / ARENA.w);
    const dotSize = Math.max(3, cls.projectileSize * PROJECTILE_SIZE_SCALE);

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
    square.style.background = cls.color;
    layoutRow();

    if (volleyTimer) clearInterval(volleyTimer);
    clearShots();
    spawnVolley(cls);
    volleyTimer = setInterval(() => spawnVolley(cls), cls.shotCooldownMs);
  }

  function stop() {
    if (volleyTimer) clearInterval(volleyTimer);
    volleyTimer = null;
    clearTimeout(dummyResetId);
    clearShots();
  }

  return { setClass, stop };
}
