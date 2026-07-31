import { DEFAULT_CLASS_ID } from '../../shared/classes.js';
import { state } from './state.js';
import {
  botClassOverlayEl, modalPlayerClassListEl, botClassListEl, botDifficultyListEl,
  btnBotClassClose, btnBotClassConfirm,
} from './dom.js';
import { createClassPicker } from './classSelect.js';
import { BOT_DIFFICULTIES, DEFAULT_BOT_DIFFICULTY } from '../../shared/botDifficulty.js';

let onConfirm = null;
let playerPicker = null;
let botPicker = null;

function initBotDifficultyPicker() {
  if (!botDifficultyListEl) return { refresh() {} };

  botDifficultyListEl.innerHTML = '';
  for (const diff of Object.values(BOT_DIFFICULTIES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'difficulty-btn';
    btn.dataset.difficultyId = diff.id;
    btn.textContent = diff.name;
    btn.addEventListener('click', () => selectDifficulty(diff.id));
    botDifficultyListEl.appendChild(btn);
  }

  function selectDifficulty(id) {
    state.botDifficulty = id;
    for (const btn of botDifficultyListEl.children) {
      btn.classList.toggle('selected', btn.dataset.difficultyId === id);
    }
  }

  function refresh() {
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
  });

  botPicker = createClassPicker({
    listEl: botClassListEl,
    getSelectedId: () => state.botClassId,
    setSelectedId: (id) => { state.botClassId = id; },
    defaultId: DEFAULT_CLASS_ID,
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
  playerPicker.refresh();
  botPicker.refresh();
  difficultyPicker.refresh();
  botClassOverlayEl.style.display = 'flex';
}

export function closeBotClassSelect() {
  botClassOverlayEl.style.display = 'none';
}

export function isBotClassSelectOpen() {
  return botClassOverlayEl.style.display === 'flex';
}
