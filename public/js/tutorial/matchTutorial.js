// Tutorial interativo de partida: a primeira partida do jogador (bot ou
// online — online cai automaticamente numa partida de bot na primeira vez,
// ver startOnline em menu.js) vira o próprio tutorial. O jogador joga
// normalmente enquanto uma faixa no topo da arena vai indicando a próxima
// ação (mover, atirar, escudo), avançando conforme ele realmente realiza
// cada uma. Também pode ser reaberto a qualquer momento pelo botão
// "Como jogar" do menu (ver forceNextMatchTutorial).

import { matchTutorialBannerEl } from '../dom.js';
import { playTutorialStepSound } from '../audio.js';

const MATCH_TUTORIAL_SEEN_KEY = 'jogoDoAno.tutorialPartidaVisto';

const STEPS = [
  { text: 'Use <strong>WASD</strong> ou as <strong>setas</strong> para se mover.', action: 'move' },
  { text: 'Clique em qualquer ponto da arena para <strong>atirar</strong>.', action: 'shoot' },
  { text: 'Segure <strong>Espaço</strong> para erguer o <strong>escudo</strong> e bloquear tiros.', action: 'shield' },
  { text: 'Boa sorte! Vence quem zerar as vidas do oponente primeiro.', action: null },
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

export function wasMatchTutorial() {
  return startedThisMatch;
}

export function resetMatchTutorialFlag() {
  startedThisMatch = false;
}

function renderStep() {
  matchTutorialBannerEl.innerHTML = STEPS[stepIndex].text;
  matchTutorialBannerEl.classList.add('visible');
}

export function startMatchTutorial() {
  marcarTutorialVisto();
  forcedNext = false;
  active = true;
  startedThisMatch = true;
  advancing = false;
  stepIndex = 0;
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
}

function advanceStep() {
  advancing = false;
  stepIndex += 1;
  if (stepIndex >= STEPS.length) {
    renderStep();
    hideTimer = setTimeout(stopMatchTutorial, FINAL_STEP_HIDE_MS);
    return;
  }
  renderStep();
}

// Chamado pelos módulos de input/jogo quando o jogador realiza uma das ações
// do passo atual. Ignorado se o tutorial não estiver ativo, a ação não for a
// esperada pelo passo corrente, ou o passo já estiver no flash de sucesso
// (evita reprocessar a mesma ação enquanto o texto ainda não avançou).
export function notifyMatchTutorial(action) {
  if (!active || advancing || STEPS[stepIndex].action !== action) return;
  advancing = true;

  playTutorialStepSound();
  matchTutorialBannerEl.classList.add('success');
  // O texto do passo atual continua na tela durante o flash verde — só troca
  // para o próximo passo quando o flash termina.
  clearTimeout(successTimer);
  successTimer = setTimeout(() => {
    matchTutorialBannerEl.classList.remove('success');
    advanceStep();
  }, SUCCESS_FLASH_MS);
}
