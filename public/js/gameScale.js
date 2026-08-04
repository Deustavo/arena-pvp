import { gameWrapEl, canvas, hudEl, matchTimerEl, escHintEl } from './dom.js';

// Margem de segurança em volta do jogo para não encostar nas bordas da tela.
const VIEWPORT_MARGIN = 24;
// Espaço entre o HUD e a arena — tem que bater com o `margin-bottom` do #hud
// no CSS, porque é a partir dele que a compensação abaixo é calculada.
const HUD_GAP = 8;
// Folga que o cronômetro precisa entre as duas colunas do HUD (ele é
// posicionado absoluto, então não entra na largura de conteúdo do #hud).
const TIMER_GAP = 24;

// Ajusta o jogo ao tamanho da tela. A arena é redimensionada por CSS (o buffer
// do canvas continua em 800x600, então render.js e a física não mudam) em vez
// de um `transform: scale()` no #game-wrap inteiro: escalando tudo junto, o HUD
// e os overlays encolhiam na mesma proporção da arena e o texto ficava
// ilegível em tela pequena (14px viravam ~6px num celular). Agora o texto tem
// tamanho próprio e só o HUD é reduzido — o mínimo necessário para caber na
// largura da arena.
export function updateGameScale() {
  if (gameWrapEl.style.display === 'none') return;
  const arenaLarguraNatural = canvas.width;
  const arenaAlturaNatural = canvas.height;
  if (!arenaLarguraNatural || !arenaAlturaNatural) return;

  const larguraDisponivel = window.innerWidth - VIEWPORT_MARGIN;
  const alturaDisponivel = window.innerHeight - VIEWPORT_MARGIN;

  // Lado a lado, as duas colunas do HUD só cabem em tela larga; empilhadas,
  // cada linha usa a largura toda e a redução necessária é bem menor.
  hudEl.classList.remove('hud-stacked');
  let hud = medirHud(false);
  if (hud.largura > larguraDisponivel) {
    hudEl.classList.add('hud-stacked');
    hud = medirHud(true);
  }

  const espacoFixo = HUD_GAP + escHintEl.offsetHeight + parseInt(getComputedStyle(escHintEl).marginTop, 10);

  // A altura do HUD depende da largura da arena (ele encolhe para caber nela) e
  // a largura da arena depende da altura que o HUD deixa livre. As duas contas
  // se alimentam, então converge-se em algumas passadas.
  let arenaLargura = Math.min(arenaLarguraNatural, larguraDisponivel);
  let escalaHud = 1;
  for (let passo = 0; passo < 4; passo++) {
    escalaHud = Math.min(1, arenaLargura / hud.largura);
    const alturaRestante = alturaDisponivel - hud.altura * escalaHud - espacoFixo;
    arenaLargura = Math.max(
      1,
      Math.min(
        arenaLarguraNatural,
        larguraDisponivel,
        alturaRestante * (arenaLarguraNatural / arenaAlturaNatural),
      ),
    );
  }
  const arenaAltura = arenaLargura * (arenaAlturaNatural / arenaLarguraNatural);

  gameWrapEl.style.width = `${arenaLargura}px`;
  canvas.style.width = `${arenaLargura}px`;
  canvas.style.height = `${arenaAltura}px`;

  // O HUD é montado numa caixa mais larga que a arena e depois reduzido para
  // caber nela — assim o texto fica no maior tamanho possível. Como o
  // #game-wrap centraliza os filhos, a caixa transborda igual dos dois lados e
  // a redução a partir do centro faz o HUD terminar alinhado com a arena.
  hudEl.style.width = `${arenaLargura / escalaHud}px`;
  hudEl.style.transformOrigin = 'top center';
  hudEl.style.transform = escalaHud < 1 ? `scale(${escalaHud})` : 'none';
  // A caixa de layout do HUD não encolhe com o transform; a margem negativa
  // devolve o espaço que sobrou visualmente, para a arena não ficar baixa.
  hudEl.style.marginBottom = `${HUD_GAP - hud.altura * (1 - escalaHud)}px`;
}

// Largura e altura do HUD sem redução nenhuma: a largura é a de conteúdo
// (`max-content`), que é o mínimo de que ele precisa para não quebrar.
function medirHud(empilhado) {
  const larguraAnterior = hudEl.style.width;
  const transformAnterior = hudEl.style.transform;
  hudEl.style.transform = 'none';
  hudEl.style.width = 'max-content';
  const largura = hudEl.scrollWidth + (empilhado ? 0 : matchTimerEl.offsetWidth + TIMER_GAP);
  const altura = hudEl.offsetHeight;
  hudEl.style.width = larguraAnterior;
  hudEl.style.transform = transformAnterior;
  return { largura, altura };
}

window.addEventListener('resize', updateGameScale);
