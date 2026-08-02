import { gameWrapEl } from './dom.js';

// Margem de segurança em volta do jogo para não encostar nas bordas da tela.
const VIEWPORT_MARGIN = 24;

// Reduz (via transform) o #game-wrap inteiro — HUD, canvas e aviso de ESC —
// numa única escala uniforme, para caber na tela sem precisar de scroll.
export function updateGameScale() {
  if (gameWrapEl.style.display === 'none') return;
  gameWrapEl.style.transform = 'none';
  const naturalWidth = gameWrapEl.offsetWidth;
  const naturalHeight = gameWrapEl.offsetHeight;
  if (!naturalWidth || !naturalHeight) return;
  const availWidth = window.innerWidth - VIEWPORT_MARGIN;
  const availHeight = window.innerHeight - VIEWPORT_MARGIN;
  const scale = Math.min(1, availWidth / naturalWidth, availHeight / naturalHeight);
  gameWrapEl.style.transform = `scale(${scale})`;
}

window.addEventListener('resize', updateGameScale);
