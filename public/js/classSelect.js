import { CLASSES, DEFAULT_CLASS_ID, getClass } from '../../shared/classes.js';
import { PLAYER_SPEED } from '../../shared/constants.js';
import { state } from './state.js';
import { classListEl, classDetailsEl } from './dom.js';

export function statLines(cls) {
  const seconds = cls.shotCooldownMs / 1000;
  const secondsLabel = Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
  const speedPct = Math.round((cls.speed / PLAYER_SPEED) * 100);
  return [
    `Tempo do tiro: ${secondsLabel}s`,
    `Dano: ${cls.damage} ${cls.damage === 1 ? 'coração' : 'corações'}`,
    `Escudo: ${cls.shieldMaxHits}`,
    `Vidas: ${cls.maxLives}`,
    `Velocidade: ${speedPct}%`,
  ];
}

export function createClassCard(cls) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'class-card';
  card.dataset.classId = cls.id;

  const icon = document.createElement('div');
  icon.className = 'class-icon';
  icon.innerHTML = cls.icon || '';
  card.appendChild(icon);

  const title = document.createElement('span');
  title.className = 'class-name';
  title.textContent = cls.name;
  card.appendChild(title);

  return card;
}

export function renderClassDetails(target, cls) {
  if (!target) return;
  target.innerHTML = '';

  const icon = document.createElement('div');
  icon.className = 'class-icon';
  icon.innerHTML = cls.icon || '';
  target.appendChild(icon);

  const info = document.createElement('div');
  info.className = 'class-info';

  const title = document.createElement('h3');
  title.textContent = cls.name;
  info.appendChild(title);

  const stats = document.createElement('div');
  stats.className = 'class-stats';
  for (const line of statLines(cls)) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.textContent = line;
    stats.appendChild(row);
  }
  info.appendChild(stats);

  if (cls.traits.length) {
    const traits = document.createElement('ul');
    traits.className = 'class-traits';
    for (const trait of cls.traits) {
      const li = document.createElement('li');
      li.textContent = trait;
      traits.appendChild(li);
    }
    info.appendChild(traits);
  }

  target.appendChild(info);
}

// Monta um seletor de classe reutilizável: uma lista de cartões que escreve
// a escolha via `setSelectedId` e mostra detalhes em `detailsEl`. Usado tanto
// pelo painel de classe do jogador (menu principal) quanto pelos dois
// seletores (jogador/bot) da modal do modo treino.
export function createClassPicker({
  listEl, detailsEl, getSelectedId, setSelectedId, defaultId = DEFAULT_CLASS_ID,
}) {
  if (!listEl) return { refresh() {} };

  function currentClass() {
    return getClass(getSelectedId() || defaultId);
  }

  function renderDetails(cls) {
    renderClassDetails(detailsEl, cls);
  }

  function selectClass(classId) {
    const cls = getClass(classId);
    setSelectedId(cls.id);
    for (const card of listEl.children) {
      card.classList.toggle('selected', card.dataset.classId === cls.id);
    }
    renderDetails(cls);
  }

  listEl.innerHTML = '';
  for (const cls of Object.values(CLASSES)) {
    const card = createClassCard(cls);
    card.addEventListener('click', () => selectClass(cls.id));
    card.addEventListener('mouseenter', () => renderDetails(cls));
    card.addEventListener('focus', () => renderDetails(cls));
    card.addEventListener('mouseleave', () => renderDetails(currentClass()));
    card.addEventListener('blur', () => renderDetails(currentClass()));
    listEl.appendChild(card);
  }

  function refresh() {
    selectClass(getSelectedId() || defaultId);
  }
  refresh();

  return { refresh };
}

export function initClassSelect() {
  createClassPicker({
    listEl: classListEl,
    detailsEl: classDetailsEl,
    getSelectedId: () => state.classId,
    setSelectedId: (id) => { state.classId = id; },
  });
}
