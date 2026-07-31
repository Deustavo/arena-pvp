import { CLASSES, DEFAULT_CLASS_ID } from '../../shared/classes.js';
import { state } from './state.js';
import { classListEl, classDetailsEl } from './dom.js';

// Ícones simples em SVG (traço único, `currentColor`) que diferenciam
// visualmente cada classe no quadrado ao lado do nome.
const CLASS_ICONS = {
  // Atirador: mira/alvo.
  atirador: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>',
  // Mago: cajado mágico com brilho na ponta.
  mago: '<svg viewBox="0 0 24 24"><path d="M4 20L14 10"/><path d="M17 2l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2 1.2-3z"/><circle cx="6" cy="6" r="1"/></svg>',
  // Tank: escudo.
  tank: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"/></svg>',
};

function statLines(cls) {
  const seconds = (cls.shotCooldownMs / 1000).toFixed(0);
  return [
    `Tempo do tiro: ${seconds}s`,
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
  icon.innerHTML = CLASS_ICONS[cls.id] || '';
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
  icon.innerHTML = CLASS_ICONS[cls.id] || '';
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
