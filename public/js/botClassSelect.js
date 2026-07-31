import { DEFAULT_CLASS_ID } from '../../shared/classes.js';
import { state } from './state.js';
import {
  botClassOverlayEl, modalPlayerClassListEl, botClassListEl,
  btnBotClassClose, btnBotClassConfirm,
} from './dom.js';
import { createClassPicker } from './classSelect.js';

let onConfirm = null;
let playerPicker = null;
let botPicker = null;

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
  botClassOverlayEl.style.display = 'flex';
}

export function closeBotClassSelect() {
  botClassOverlayEl.style.display = 'none';
}

export function isBotClassSelectOpen() {
  return botClassOverlayEl.style.display === 'flex';
}
