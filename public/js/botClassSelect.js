import { DEFAULT_CLASS_ID } from '../../shared/classes.js';
import { state } from './state.js';
import {
  botClassOverlayEl, modalPlayerClassListEl, botClassListEl,
  botDifficultyDropdownEl, botDifficultyToggleEl, botDifficultyValueEl, botDifficultyListEl,
  btnBotClassClose, btnBotClassConfirm,
} from './dom.js';
import { createClassPicker } from './classSelect.js';
import { BOT_DIFFICULTIES, DEFAULT_BOT_DIFFICULTY } from '../../shared/botDifficulty.js';

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
  }

  function closeDropdown() {
    botDifficultyDropdownEl.classList.remove('open');
    botDifficultyToggleEl.setAttribute('aria-expanded', 'false');
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

let difficultyPicker = null;

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
}

export function closeBotClassSelect() {
  botClassOverlayEl.style.display = 'none';
}

export function isBotClassSelectOpen() {
  return botClassOverlayEl.style.display === 'flex';
}
