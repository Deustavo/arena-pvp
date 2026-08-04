import {
  howToPlayOverlayEl, tutTitleEl, tutTextEl, tutDotsEl, tutStepCountEl,
  btnTutPrev, btnTutNext, btnTutClose, btnTutSkip,
} from '../dom.js';
import { TUT, clamp, tutCtx } from './canvasHelpers.js';
import { TUTORIAL_STEPS } from './steps.js';

let tutStep = 0;
let tutRaf = null;
let tutStepStart = 0;

// Ação de "jogar" adiada enquanto o tutorial de primeira vez está aberto.
let pendingStart = null;

function buildTutorialDots() {
  tutDotsEl.innerHTML = '';
  TUTORIAL_STEPS.forEach((step, i) => {
    const dot = document.createElement('button');
    dot.className = 'tut-dot';
    dot.title = step.title;
    dot.addEventListener('click', () => setTutorialStep(i));
    tutDotsEl.appendChild(dot);
  });
}

function setTutorialStep(index) {
  tutStep = clamp(index, 0, TUTORIAL_STEPS.length - 1);
  const step = TUTORIAL_STEPS[tutStep];
  tutTitleEl.textContent = step.title;
  tutTextEl.innerHTML = step.text;
  tutStepCountEl.textContent = `${tutStep + 1} / ${TUTORIAL_STEPS.length}`;
  btnTutPrev.disabled = tutStep === 0;
  btnTutNext.textContent = tutStep === TUTORIAL_STEPS.length - 1 ? 'Entendi' : 'Próximo';
  for (let i = 0; i < tutDotsEl.children.length; i++) {
    tutDotsEl.children[i].classList.toggle('active', i === tutStep);
  }
  tutStepStart = performance.now();
}

function tutorialFrame() {
  const step = TUTORIAL_STEPS[tutStep];
  const t = (performance.now() - tutStepStart) % step.loop;
  tutCtx.clearRect(0, 0, TUT.w, TUT.h);
  step.draw(t);
  tutRaf = requestAnimationFrame(tutorialFrame);
}

export function openTutorial() {
  howToPlayOverlayEl.style.display = 'flex';
  setTutorialStep(0);
  if (tutRaf === null) tutRaf = requestAnimationFrame(tutorialFrame);
}

export function closeTutorial() {
  howToPlayOverlayEl.style.display = 'none';
  if (tutRaf !== null) {
    cancelAnimationFrame(tutRaf);
    tutRaf = null;
  }
  if (pendingStart) {
    const start = pendingStart;
    pendingStart = null;
    start();
  }
}

export function isTutorialOpen() {
  return howToPlayOverlayEl.style.display === 'flex';
}

const TUTORIAL_SEEN_KEY = 'jogoDoAno.tutorialVisto';

function tutorialJaVisto() {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function marcarTutorialVisto() {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    /* localStorage indisponível: mostra o tutorial de novo na próxima visita */
  }
}

// Na primeira vez que o jogador clica em jogar, abre o tutorial e só inicia a
// partida quando ele fechar.
export function comTutorialNaPrimeiraVez(start) {
  if (tutorialJaVisto()) {
    start();
    return;
  }
  marcarTutorialVisto();
  pendingStart = start;
  openTutorial();
}

export function initTutorialUI() {
  buildTutorialDots();

  btnTutClose.addEventListener('click', () => closeTutorial());
  btnTutSkip.addEventListener('click', () => closeTutorial());
  btnTutPrev.addEventListener('click', () => setTutorialStep(tutStep - 1));
  btnTutNext.addEventListener('click', () => {
    if (tutStep === TUTORIAL_STEPS.length - 1) closeTutorial();
    else setTutorialStep(tutStep + 1);
  });
  howToPlayOverlayEl.addEventListener('click', (e) => {
    if (e.target === howToPlayOverlayEl) closeTutorial();
  });
  window.addEventListener('keydown', (e) => {
    if (!isTutorialOpen()) return;
    if (e.key === 'Escape') closeTutorial();
    else if (e.key === 'ArrowRight') setTutorialStep(tutStep + 1);
    else if (e.key === 'ArrowLeft') setTutorialStep(tutStep - 1);
  });
}

export function openHowToPlay() {
  marcarTutorialVisto();
  pendingStart = null;
  openTutorial();
}
