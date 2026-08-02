import { CLASSES, DEFAULT_CLASS_ID, getClass } from '../../shared/classes.js';
import { PLAYER_SPEED } from '../../shared/constants.js';
import { state } from './state.js';
import { classListEl, classDetailsEl } from './dom.js';

// Ícones em linha (mesmo estilo dos ícones de classe) para cada estatística,
// usados para tornar o painel de detalhes mais fácil de escanear visualmente.
const STAT_ICONS = {
  cooldown: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  damage: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"/></svg>',
  life: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.35-9.5-8.8C.8 8.6 2.4 5 6 5c2 0 3.3 1.1 4 2.2C10.7 6.1 12 5 14 5c3.6 0 5.2 3.6 3.5 7.2C19 16.65 12 21 12 21z"/></svg>',
  speed: '<svg viewBox="0 0 24 24"><path d="M4 17l6-3-6-3M13 20l6-3-6-3"/></svg>',
};

export function statLines(cls) {
  const seconds = cls.shotCooldownMs / 1000;
  const secondsLabel = Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
  const speedPct = Math.round((cls.speed / PLAYER_SPEED) * 100);
  return [
    { icon: STAT_ICONS.cooldown, label: 'Cadência', value: `${secondsLabel}s` },
    { icon: STAT_ICONS.damage, label: 'Dano', value: `${cls.damage} ${cls.damage === 1 ? 'coração' : 'corações'}` },
    { icon: STAT_ICONS.shield, label: 'Escudo', value: `${cls.shieldMaxHits} ${cls.shieldMaxHits === 1 ? 'hit' : 'hits'}` },
    { icon: STAT_ICONS.life, label: 'Vidas', value: `${cls.maxLives}` },
    { icon: STAT_ICONS.speed, label: 'Velocidade', value: `${speedPct}%` },
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
  for (const stat of statLines(cls)) {
    const row = document.createElement('div');
    row.className = 'stat-row';

    const icon = document.createElement('span');
    icon.className = 'stat-icon';
    icon.innerHTML = stat.icon;
    row.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = stat.label;
    row.appendChild(label);

    const value = document.createElement('span');
    value.className = 'stat-value';
    value.textContent = stat.value;
    row.appendChild(value);

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
