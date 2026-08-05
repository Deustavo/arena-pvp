// Modal de créditos (música e assets), aberta pelo botão embaixo do ranking.
import { btnCredits, creditsOverlayEl, btnCreditsClose } from './dom.js';

function abrir() {
  creditsOverlayEl.classList.add('visible');
}

function fechar() {
  creditsOverlayEl.classList.add('closing');
  creditsOverlayEl.addEventListener('animationend', () => {
    creditsOverlayEl.classList.remove('visible', 'closing');
  }, { once: true });
}

export function initCredits() {
  btnCredits.addEventListener('click', abrir);
  btnCreditsClose.addEventListener('click', fechar);
  creditsOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === creditsOverlayEl) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && creditsOverlayEl.classList.contains('visible')) fechar();
  });
}
