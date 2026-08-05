// Tutorial interativo de partida: a primeira partida do jogador (bot ou
// online — online cai automaticamente numa partida de bot na primeira vez,
// ver startOnline em menu.js) vira o próprio tutorial. O jogador joga
// normalmente enquanto uma faixa no topo da arena vai indicando a próxima
// ação (mover, atirar, escudo), avançando conforme ele realmente realiza
// cada uma. Também pode ser reaberto a qualquer momento pelo botão
// "Como jogar" do menu (ver forceNextMatchTutorial).

import { matchTutorialBannerEl, canvasWrapEl, tutorialClickHintEl } from '../dom.js';
import { playTutorialStepSound, playTutorialCompleteSound } from '../audio.js';

const MATCH_TUTORIAL_SEEN_KEY = 'jogoDoAno.tutorialPartidaVisto';

// Teclado do passo de movimento, na disposição física do WASD. O passo só é
// concluído quando o jogador aperta as quatro — cada tecla acende conforme é
// usada, então dá para ver o que ainda falta.
const TECLAS_MOVIMENTO = [
  [{ token: 'up', label: 'W' }],
  [{ token: 'left', label: 'A' }, { token: 'down', label: 'S' }, { token: 'right', label: 'D' }],
];

function tecla(label, done, larga = false) {
  const classes = ['tutorial-tecla'];
  if (larga) classes.push('larga');
  if (done) classes.push('done');
  return `<span class="${classes.join(' ')}">${label}</span>`;
}

function htmlPassoMovimento(feitas) {
  const linhas = TECLAS_MOVIMENTO
    .map((linha) => `<div class="tutorial-teclas-linha">${
      linha.map((t) => tecla(t.label, feitas.has(t.token))).join('')
    }</div>`)
    .join('');
  return `Aperte <span class="tutorial-tecla-nome">todas</span> as teclas abaixo para se mover.`
    + `<div class="tutorial-teclas">${linhas}</div>`;
}

function htmlPassoEscudo(feitas) {
  return 'Segure <span class="tutorial-tecla-nome">Espaço</span> para erguer o escudo e bloquear tiros.'
    + `<div class="tutorial-teclas"><div class="tutorial-teclas-linha">${
      tecla('Espaço', feitas.has('shield'), true)
    }</div></div>`;
}

// `keys`: tokens que o passo exige (todos, não apenas um). Passos sem `keys`
// avançam na primeira vez que a ação acontece.
const STEPS = [
  {
    action: 'move',
    keys: TECLAS_MOVIMENTO.flat().map((t) => t.token),
    html: htmlPassoMovimento,
  },
  {
    action: 'shoot',
    html: () => 'Clique em qualquer ponto da arena para <strong>atirar</strong>.',
    dicaCursor: true,
  },
  {
    action: 'shield',
    keys: ['shield'],
    html: htmlPassoEscudo,
  },
  { action: null, html: () => 'Atire no inimigo até derrota-lo.' },
];

const FINAL_STEP_HIDE_MS = 4000;
// Duração do flash verde do balão ao completar um passo — tempo suficiente
// para o jogador perceber antes do texto do próximo passo assentar.
const SUCCESS_FLASH_MS = 1800;

let active = false;
let stepIndex = 0;
let hideTimer = null;
let successTimer = null;
// true durante o flash verde, entre a ação ser completada e o texto do
// próximo passo aparecer — evita reprocessar a mesma ação nesse intervalo.
let advancing = false;
// Força o tutorial a rodar na próxima partida mesmo que já tenha sido visto
// (usado pelo botão "Como jogar", que deve poder reabri-lo a qualquer hora).
let forcedNext = false;
// Tokens de tecla já apertados no passo atual (ver `keys` em STEPS).
const teclasFeitas = new Set();
let cursorListenerAtivo = false;
// true se o tutorial foi iniciado na partida atual — diferente de `active`,
// que já vira false antes do fim real da partida (passo final se esconde
// sozinho após FINAL_STEP_HIDE_MS). Usado pelo overlay de fim de jogo para
// esconder "Jogar novamente"/"Trocar classes" quando a partida era o
// tutorial. Zerado só em prepareNewMatch (menu.js), via resetMatchTutorialFlag.
let startedThisMatch = false;

function tutorialJaVisto() {
  try {
    return localStorage.getItem(MATCH_TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function marcarTutorialVisto() {
  try {
    localStorage.setItem(MATCH_TUTORIAL_SEEN_KEY, '1');
  } catch {
    /* localStorage indisponível: tutorial de partida aparece de novo na próxima visita */
  }
}

export function shouldStartMatchTutorial() {
  return forcedNext || !tutorialJaVisto();
}

export function forceNextMatchTutorial() {
  forcedNext = true;
}

export function isMatchTutorialActive() {
  return active;
}

// true enquanto o oponente do tutorial precisa ser um alvo indestrutível: o
// jogador não pode encerrar a partida (matando o bot) antes de ter passado por
// mover, atirar e escudar. Deixa de valer no passo final (`action: null`, a
// mensagem de "boa sorte"), que é justamente quando a partida vira uma partida
// de verdade e o bot pode morrer.
export function isMatchTutorialDummyInvulnerable() {
  return active && STEPS[stepIndex].action !== null;
}

export function wasMatchTutorial() {
  return startedThisMatch;
}

export function resetMatchTutorialFlag() {
  startedThisMatch = false;
}

// A dica só faz sentido em cima do ponteiro, então ela segue o mouse enquanto
// o passo de atirar está na tela. O listener é registrado uma única vez e sai
// barato quando a dica está escondida.
function seguirCursor(e) {
  if (!tutorialClickHintEl.classList.contains('visible')) return;
  const rect = canvasWrapEl.getBoundingClientRect();
  tutorialClickHintEl.style.left = `${e.clientX - rect.left}px`;
  tutorialClickHintEl.style.top = `${e.clientY - rect.top}px`;
}

function mostrarDicaCursor(mostrar) {
  tutorialClickHintEl.classList.toggle('visible', mostrar);
  if (!mostrar || cursorListenerAtivo) return;
  window.addEventListener('mousemove', seguirCursor);
  cursorListenerAtivo = true;
}

function renderStep() {
  const step = STEPS[stepIndex];
  matchTutorialBannerEl.innerHTML = step.html(teclasFeitas);
  matchTutorialBannerEl.classList.add('visible');
  mostrarDicaCursor(Boolean(step.dicaCursor));
}

export function startMatchTutorial() {
  marcarTutorialVisto();
  forcedNext = false;
  active = true;
  startedThisMatch = true;
  advancing = false;
  stepIndex = 0;
  teclasFeitas.clear();
  clearTimeout(hideTimer);
  clearTimeout(successTimer);
  hideTimer = null;
  successTimer = null;
  matchTutorialBannerEl.classList.remove('success');
  renderStep();
}

export function stopMatchTutorial() {
  active = false;
  advancing = false;
  clearTimeout(hideTimer);
  clearTimeout(successTimer);
  hideTimer = null;
  successTimer = null;
  matchTutorialBannerEl.classList.remove('visible', 'success');
  mostrarDicaCursor(false);
}

function advanceStep() {
  advancing = false;
  stepIndex += 1;
  teclasFeitas.clear();
  if (stepIndex >= STEPS.length) {
    renderStep();
    hideTimer = setTimeout(stopMatchTutorial, FINAL_STEP_HIDE_MS);
    return;
  }
  // O último passo (`action: null`) é a mensagem de "boa sorte": chegar nele
  // significa que o jogador completou mover, atirar e escudar.
  if (STEPS[stepIndex].action === null) playTutorialCompleteSound();
  renderStep();
}

// Chamado pelos módulos de input/jogo quando o jogador realiza uma das ações
// do passo atual. Ignorado se o tutorial não estiver ativo, a ação não for a
// esperada pelo passo corrente, ou o passo já estiver no flash de sucesso
// (evita reprocessar a mesma ação enquanto o texto ainda não avançou).
// `detail` identifica *qual* tecla foi apertada nos passos que exigem várias
// (movimento): o passo só avança quando todas foram usadas.
export function notifyMatchTutorial(action, detail) {
  const step = STEPS[stepIndex];
  if (!active || advancing || step.action !== action) return;

  if (step.keys) {
    const token = detail ?? step.keys[0];
    if (!step.keys.includes(token) || teclasFeitas.has(token)) return;
    teclasFeitas.add(token);
    if (teclasFeitas.size < step.keys.length) {
      // Ainda falta tecla: acende a que acabou de ser usada e continua no passo.
      playTutorialStepSound();
      renderStep();
      return;
    }
  }

  advancing = true;
  mostrarDicaCursor(false);

  playTutorialStepSound();
  // Redesenha antes do flash para a última tecla aparecer acesa junto com o
  // verde de sucesso, em vez de ficar cinza até o passo trocar.
  if (step.keys) renderStep();
  matchTutorialBannerEl.classList.add('success');
  // O texto do passo atual continua na tela durante o flash verde — só troca
  // para o próximo passo quando o flash termina.
  clearTimeout(successTimer);
  successTimer = setTimeout(() => {
    matchTutorialBannerEl.classList.remove('success');
    advanceStep();
  }, SUCCESS_FLASH_MS);
}
