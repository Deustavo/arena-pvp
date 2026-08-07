import { DEFAULT_CLASS_ID } from '../../shared/classes.js';
import { state } from './state.js';
import {
  botClassOverlayEl, modalPlayerClassListEl, botClassListEl,
  botDifficultyDropdownEl, botDifficultyToggleEl, botDifficultyValueEl, botDifficultyListEl,
  botArenaDropdownEl, botArenaToggleEl, botArenaValueEl, botArenaListEl,
  btnBotClassClose, btnBotClassConfirm,
} from './dom.js';
import { createClassPicker } from './classSelect.js';
import { BOT_DIFFICULTIES, DEFAULT_BOT_DIFFICULTY } from '../../shared/botDifficulty.js';
import { ARENA_TIPOS } from '../../shared/arenaEvents.js';
import { positionDropdownMenu, resetDropdownMenu } from './dropdownPosition.js';

// Rótulos de exibição das arenas — não é regra de jogo, então fica só aqui na
// UI (shared/arenaEvents.js só conhece os ids). `null` representa "aleatória",
// o mesmo sorteio do modo online (sortearArena).
const ARENA_LABELS = { terra: 'Terra', areia: 'Areia', gelo: 'Gelo', fogo: 'Fogo' };
const ARENA_ALEATORIA_LABEL = 'Aleatória';

let onConfirm = null;
let playerPicker = null;
let botPicker = null;

function initBotDifficultyPicker() {
  if (!botDifficultyListEl || !botDifficultyToggleEl) return { refresh() {} };

  botDifficultyListEl.innerHTML = '';
  for (const diff of Object.values(BOT_DIFFICULTIES)) {
    const item = document.createElement('li');
    item.className = 'dropdown-item';
    item.dataset.difficultyId = diff.id;
    item.textContent = diff.name;
    item.setAttribute('role', 'option');
    item.addEventListener('click', () => {
      selectDifficulty(diff.id);
      closeDropdown();
    });
    botDifficultyListEl.appendChild(item);
  }

  function openDropdown() {
    botDifficultyDropdownEl.classList.add('open');
    botDifficultyToggleEl.setAttribute('aria-expanded', 'true');
    positionDropdownMenu(botDifficultyToggleEl, botDifficultyListEl);
  }

  function closeDropdown() {
    botDifficultyDropdownEl.classList.remove('open');
    botDifficultyToggleEl.setAttribute('aria-expanded', 'false');
    resetDropdownMenu(botDifficultyListEl);
  }

  function toggleDropdown() {
    if (botDifficultyDropdownEl.classList.contains('open')) closeDropdown();
    else openDropdown();
  }

  botDifficultyToggleEl.addEventListener('click', toggleDropdown);
  document.addEventListener('click', (e) => {
    if (!botDifficultyDropdownEl.contains(e.target)) closeDropdown();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  function selectDifficulty(id) {
    state.botDifficulty = id;
    const diff = BOT_DIFFICULTIES[id] || BOT_DIFFICULTIES[DEFAULT_BOT_DIFFICULTY];
    botDifficultyValueEl.textContent = diff.name;
    for (const item of botDifficultyListEl.children) {
      item.classList.toggle('selected', item.dataset.difficultyId === diff.id);
      item.setAttribute('aria-selected', item.dataset.difficultyId === diff.id ? 'true' : 'false');
    }
  }

  function refresh() {
    closeDropdown();
    selectDifficulty(state.botDifficulty || DEFAULT_BOT_DIFFICULTY);
  }
  refresh();

  return { refresh };
}

// Mesmo padrão de dropdown de initBotDifficultyPicker, com um item a mais no
// topo para "aleatória" (id vazio, mapeado para `null` em state.botArenaTipo).
function initBotArenaPicker() {
  if (!botArenaListEl || !botArenaToggleEl) return { refresh() {} };

  botArenaListEl.innerHTML = '';
  const opcoes = [{ id: '', name: ARENA_ALEATORIA_LABEL }, ...ARENA_TIPOS.map((id) => ({ id, name: ARENA_LABELS[id] }))];
  for (const opcao of opcoes) {
    const item = document.createElement('li');
    item.className = 'dropdown-item';
    item.dataset.arenaId = opcao.id;
    item.textContent = opcao.name;
    item.setAttribute('role', 'option');
    item.addEventListener('click', () => {
      selectArena(opcao.id);
      closeDropdown();
    });
    botArenaListEl.appendChild(item);
  }

  function openDropdown() {
    botArenaDropdownEl.classList.add('open');
    botArenaToggleEl.setAttribute('aria-expanded', 'true');
    positionDropdownMenu(botArenaToggleEl, botArenaListEl);
  }

  function closeDropdown() {
    botArenaDropdownEl.classList.remove('open');
    botArenaToggleEl.setAttribute('aria-expanded', 'false');
    resetDropdownMenu(botArenaListEl);
  }

  function toggleDropdown() {
    if (botArenaDropdownEl.classList.contains('open')) closeDropdown();
    else openDropdown();
  }

  botArenaToggleEl.addEventListener('click', toggleDropdown);
  document.addEventListener('click', (e) => {
    if (!botArenaDropdownEl.contains(e.target)) closeDropdown();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  function selectArena(id) {
    state.botArenaTipo = id || null;
    botArenaValueEl.textContent = id ? ARENA_LABELS[id] : ARENA_ALEATORIA_LABEL;
    for (const item of botArenaListEl.children) {
      item.classList.toggle('selected', item.dataset.arenaId === id);
      item.setAttribute('aria-selected', item.dataset.arenaId === id ? 'true' : 'false');
    }
  }

  function refresh() {
    closeDropdown();
    selectArena(state.botArenaTipo || '');
  }
  refresh();

  return { refresh };
}

let difficultyPicker = null;
let arenaPicker = null;

export function initBotClassSelect() {
  if (!botClassOverlayEl) return;

  playerPicker = createClassPicker({
    listEl: modalPlayerClassListEl,
    getSelectedId: () => state.classId,
    setSelectedId: (id) => { state.classId = id; },
    dropdown: true,
  });

  botPicker = createClassPicker({
    listEl: botClassListEl,
    getSelectedId: () => state.botClassId,
    setSelectedId: (id) => { state.botClassId = id; },
    defaultId: DEFAULT_CLASS_ID,
    dropdown: true,
  });

  difficultyPicker = initBotDifficultyPicker();
  arenaPicker = initBotArenaPicker();

  btnBotClassClose.addEventListener('click', closeBotClassSelect);
  btnBotClassConfirm.addEventListener('click', () => {
    closeBotClassSelect();
    if (onConfirm) onConfirm();
  });
  botClassOverlayEl.addEventListener('click', (e) => {
    if (e.target === botClassOverlayEl) closeBotClassSelect();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isBotClassSelectOpen()) closeBotClassSelect();
  });
}

export function openBotClassSelect(confirmCallback) {
  onConfirm = confirmCallback;
  botClassOverlayEl.style.display = 'flex';
  playerPicker.refresh();
  botPicker.refresh();
  difficultyPicker.refresh();
  arenaPicker.refresh();
}

export function closeBotClassSelect() {
  botClassOverlayEl.classList.add('closing');
  botClassOverlayEl.addEventListener('animationend', () => {
    botClassOverlayEl.style.display = 'none';
    botClassOverlayEl.classList.remove('closing');
  }, { once: true });
}

export function isBotClassSelectOpen() {
  return botClassOverlayEl.style.display === 'flex';
}
