// Modal do histórico de versões, aberta pelo botão "Novidades" do menu. O
// conteúdo é estático no index.html (mesmo texto do CHANGELOG.md na raiz), então
// aqui só mora o abre/fecha — mesmo padrão de credits.js.
//
// A única exceção é a galeria de personagens do tópico "Sprites dos
// personagens": ela precisa da spritesheet de cada classe, que só existe em
// JS, então é montada aqui (`montarGaleriaDeSprites`).
import { btnChangelog, changelogOverlayEl, btnChangelogClose } from './dom.js';
import { CLASSES } from '../../shared/classes.js';
import { applyClassSprite } from './classSprite.js';

// Um card por classe: o personagem andando (animação `walk`, a mesma da
// partida) e, embaixo, o nome do demônio e a classe dele — mesmo par de linhas
// dos cartões de seleção de classe (`fillClassNameEl` em classSelect.js).
function montarGaleriaDeSprites() {
  const galeria = changelogOverlayEl.querySelector('#changelogSprites');
  if (!galeria || galeria.childElementCount) return;

  for (const cls of Object.values(CLASSES)) {
    const item = document.createElement('div');
    item.className = 'changelog-sprite-item';
    item.style.setProperty('--class-color', cls.color);

    const sprite = document.createElement('div');
    sprite.className = 'changelog-sprite';
    applyClassSprite(sprite, cls.id, 'walk');
    item.appendChild(sprite);

    const demonName = document.createElement('span');
    demonName.className = 'class-demon-name';
    demonName.textContent = cls.demonName || cls.name;
    item.appendChild(demonName);

    const className = document.createElement('span');
    className.className = 'class-name-secondary';
    className.textContent = cls.name;
    item.appendChild(className);

    galeria.appendChild(item);
  }
}

// Bolinha de notificação no botão "Novidades": some no primeiro clique e
// volta quando sai uma versão nova. Guardamos a versão vista (e não um
// booleano) justamente por isso — o número exibido em #menuVersion é a fonte,
// então publicar uma versão nova já reacende a bolinha, sem chave nova.
const NOVIDADES_VISTAS_KEY = 'jogoDoAno.novidadesVistas';

function versaoAtual() {
  return btnChangelog.querySelector('#menuVersion')?.textContent.trim() || '';
}

function versaoVista() {
  try {
    return localStorage.getItem(NOVIDADES_VISTAS_KEY);
  } catch {
    // localStorage indisponível: sem memória, a bolinha some só nesta visita.
    return null;
  }
}

function marcarNovidadesVistas() {
  btnChangelog.classList.remove('tem-novidade');
  try {
    localStorage.setItem(NOVIDADES_VISTAS_KEY, versaoAtual());
  } catch {
    // idem: nada a fazer, a bolinha volta no próximo carregamento.
  }
}

function abrir() {
  marcarNovidadesVistas();
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
  montarGaleriaDeSprites();
  if (versaoVista() !== versaoAtual()) btnChangelog.classList.add('tem-novidade');
  btnChangelog.addEventListener('click', abrir);
  btnChangelogClose.addEventListener('click', fechar);
  changelogOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === changelogOverlayEl) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && changelogOverlayEl.classList.contains('visible')) fechar();
  });
}
