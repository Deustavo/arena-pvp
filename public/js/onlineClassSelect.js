import { state } from './state.js';
import {
  onlineClassOverlayEl, classListEl, classPreviewEl, classDetailsEl,
  btnOnlineClassClose, btnOnlineClassConfirm,
} from './dom.js';
import { createClassPicker } from './classSelect.js';
import { createClassPreview } from './classPreview.js';

let onConfirm = null;
let playerPicker = null;
let preview = null;

export function initOnlineClassSelect() {
  if (!onlineClassOverlayEl) return;

  preview = createClassPreview(classPreviewEl);

  playerPicker = createClassPicker({
    listEl: classListEl,
    detailsEl: classDetailsEl,
    getSelectedId: () => state.classId,
    setSelectedId: (id) => { state.classId = id; },
    onPreview: (cls) => preview.setClass(cls.id),
  });

  btnOnlineClassClose.addEventListener('click', closeOnlineClassSelect);
  btnOnlineClassConfirm.addEventListener('click', () => {
    closeOnlineClassSelect();
    if (onConfirm) onConfirm();
  });
  onlineClassOverlayEl.addEventListener('click', (e) => {
    if (e.target === onlineClassOverlayEl) closeOnlineClassSelect();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOnlineClassSelectOpen()) closeOnlineClassSelect();
  });
}

export function openOnlineClassSelect(confirmCallback) {
  onConfirm = confirmCallback;
  onlineClassOverlayEl.style.display = 'flex';
  playerPicker.refresh();
}

export function closeOnlineClassSelect() {
  onlineClassOverlayEl.style.display = 'none';
  preview.stop();
}

export function isOnlineClassSelectOpen() {
  return onlineClassOverlayEl.style.display === 'flex';
}
