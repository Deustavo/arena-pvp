import { CLASSES, DEFAULT_CLASS_ID } from '../../shared/classes.js';
import { state } from './state.js';
import { classListEl, classDetailsEl } from './dom.js';

function statLines(cls) {
  const seconds = cls.shotCooldownMs / 1000;
  const secondsLabel = Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
  return [
    `Tempo do tiro: ${secondsLabel}s`,
    `Dano: ${cls.damage} ${cls.damage === 1 ? 'coração' : 'corações'}`,
    `Escudo: ${cls.shieldMaxHits}`,
    `Vidas: ${cls.maxLives}`,
  ];
}

function createClassCard(cls) {
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

function renderDetails(cls) {
  if (!classDetailsEl) return;
  classDetailsEl.innerHTML = '';

  const icon = document.createElement('div');
  icon.className = 'class-icon';
  icon.innerHTML = cls.icon || '';
  classDetailsEl.appendChild(icon);

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

  classDetailsEl.appendChild(info);
}

export function initClassSelect() {
  if (!classListEl) return;
  classListEl.innerHTML = '';
  for (const cls of Object.values(CLASSES)) {
    const card = createClassCard(cls);
    card.addEventListener('click', () => selectClass(cls.id));
    card.addEventListener('mouseenter', () => renderDetails(cls));
    card.addEventListener('focus', () => renderDetails(cls));
    card.addEventListener('mouseleave', () => renderDetails(getClass(state.classId)));
    card.addEventListener('blur', () => renderDetails(getClass(state.classId)));
    classListEl.appendChild(card);
  }
  selectClass(state.classId || DEFAULT_CLASS_ID);
}

function getClass(classId) {
  return CLASSES[classId] || CLASSES[DEFAULT_CLASS_ID];
}

function selectClass(classId) {
  const cls = getClass(classId);
  state.classId = cls.id;
  if (!classListEl) return;
  for (const card of classListEl.children) {
    card.classList.toggle('selected', card.dataset.classId === cls.id);
  }
  renderDetails(cls);
}
