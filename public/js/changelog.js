// Modal do histórico de versões, aberta pelo botão "Novidades" do menu. O
// conteúdo é estático no index.html (mesmo texto do CHANGELOG.md na raiz), então
// aqui só mora o abre/fecha — mesmo padrão de credits.js.
import { btnChangelog, changelogOverlayEl, btnChangelogClose } from './dom.js';

function abrir() {
  changelogOverlayEl.classList.add('visible');
  // Uma versão nova entra no topo: reabrir a modal deve mostrar o começo da
  // lista, não a rolagem de onde ela parou da última vez.
  changelogOverlayEl.querySelector('#changelogBody').scrollTop = 0;
}

function fechar() {
  changelogOverlayEl.classList.add('closing');
  changelogOverlayEl.addEventListener('animationend', () => {
    changelogOverlayEl.classList.remove('visible', 'closing');
  }, { once: true });
}

export function initChangelog() {
  btnChangelog.addEventListener('click', abrir);
  btnChangelogClose.addEventListener('click', fechar);
  changelogOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === changelogOverlayEl) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && changelogOverlayEl.classList.contains('visible')) fechar();
  });
}
