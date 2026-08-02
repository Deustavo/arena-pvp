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
  life: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-4.8-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6.2-8 11-8 11z"/></svg>',
  speed: '<svg viewBox="0 0 24 24"><path d="M4 17l6-3-6-3M13 20l6-3-6-3"/></svg>',
};

export function statLines(cls) {
  const seconds = cls.shotCooldownMs / 1000;
  const secondsLabel = Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
  const speedPct = Math.round((cls.speed / PLAYER_SPEED) * 100);
  return [
    { icon: STAT_ICONS.cooldown, label: 'Tiros a cada', value: `${secondsLabel}s` },
    { icon: STAT_ICONS.damage, label: 'Dano', value: `${cls.damage} ${cls.damage === 1 ? 'coração' : 'corações'}` },
    { icon: STAT_ICONS.shield, label: 'Escudo', value: `${cls.shieldMaxHits} ${cls.shieldMaxHits === 1 ? 'hit' : 'hits'}` },
    { icon: STAT_ICONS.life, label: 'Vidas', value: `${cls.maxLives}` },
    { icon: STAT_ICONS.speed, label: 'Velocidade', value: `${speedPct}%` },
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

function createClassDropdownItem(cls) {
  const item = document.createElement('li');
  item.className = 'dropdown-item class-dropdown-item';
  item.dataset.classId = cls.id;
  item.setAttribute('role', 'option');

  const icon = document.createElement('div');
  icon.className = 'class-icon';
  icon.innerHTML = cls.icon || '';
  item.appendChild(icon);

  const title = document.createElement('span');
  title.className = 'class-name';
  title.textContent = cls.name;
  item.appendChild(title);

  return item;
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

// Monta um seletor de classe reutilizável: escreve a escolha via
// `setSelectedId` e mostra detalhes em `detailsEl`. No menu principal usa uma
// grade de cartões; na modal do modo treino (`dropdown: true`) usa um
// dropdown compacto para caber duas colunas (jogador/bot) lado a lado.
export function createClassPicker({
  listEl, detailsEl, getSelectedId, setSelectedId, defaultId = DEFAULT_CLASS_ID, dropdown = false,
}) {
  if (!listEl) return { refresh() {} };

  function currentClass() {
    return getClass(getSelectedId() || defaultId);
  }

  function renderDetails(cls) {
    renderClassDetails(detailsEl, cls);
  }

  // Fixa a altura do painel de detalhes na maior necessária entre as classes,
  // para trocar de classe não redimensionar o painel e deslocar o menu.
  function lockDetailsHeight() {
    if (!detailsEl) return;
    detailsEl.style.minHeight = '';
    let max = 0;
    for (const cls of Object.values(CLASSES)) {
      renderClassDetails(detailsEl, cls);
      // offsetHeight (não scrollHeight) para bater com o box model de
      // min-height em box-sizing: border-box (inclui borda + padding).
      max = Math.max(max, detailsEl.offsetHeight);
    }
    detailsEl.style.minHeight = `${max}px`;
  }

  if (!dropdown) {
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
      lockDetailsHeight();
      selectClass(getSelectedId() || defaultId);
    }
    refresh();

    return { refresh };
  }

  listEl.innerHTML = '';
  listEl.classList.add('dropdown', 'class-dropdown');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'dropdown-toggle class-dropdown-toggle';
  toggle.setAttribute('aria-haspopup', 'listbox');
  toggle.setAttribute('aria-expanded', 'false');

  const toggleIcon = document.createElement('div');
  toggleIcon.className = 'class-icon';
  toggle.appendChild(toggleIcon);

  const toggleName = document.createElement('span');
  toggleName.className = 'class-name';
  toggle.appendChild(toggleName);

  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('class', 'dropdown-arrow');
  arrow.setAttribute('width', '12');
  arrow.setAttribute('height', '8');
  arrow.setAttribute('viewBox', '0 0 12 8');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.innerHTML = '<path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  toggle.appendChild(arrow);

  const menu = document.createElement('ul');
  menu.className = 'dropdown-menu class-dropdown-menu';
  menu.setAttribute('role', 'listbox');
  menu.tabIndex = -1;

  listEl.appendChild(toggle);
  listEl.appendChild(menu);

  function openMenu() {
    listEl.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    listEl.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    renderDetails(currentClass());
  }

  function toggleMenu() {
    if (listEl.classList.contains('open')) closeMenu();
    else openMenu();
  }

  toggle.addEventListener('click', toggleMenu);
  document.addEventListener('click', (e) => {
    if (listEl.classList.contains('open') && !listEl.contains(e.target)) closeMenu();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && listEl.classList.contains('open')) closeMenu();
  });

  function selectClass(classId) {
    const cls = getClass(classId);
    setSelectedId(cls.id);
    toggleIcon.innerHTML = cls.icon || '';
    toggleName.textContent = cls.name;
    for (const item of menu.children) {
      const selected = item.dataset.classId === cls.id;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    renderDetails(cls);
  }

  for (const cls of Object.values(CLASSES)) {
    const item = createClassDropdownItem(cls);
    item.addEventListener('click', () => {
      selectClass(cls.id);
      closeMenu();
    });
    item.addEventListener('mouseenter', () => renderDetails(cls));
    item.addEventListener('mouseleave', () => renderDetails(currentClass()));
    menu.appendChild(item);
  }

  function refresh() {
    lockDetailsHeight();
    closeMenu();
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
