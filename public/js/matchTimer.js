// Cronômetro exibido sobre a arena. A contagem em si é regra de jogo e vive
// em shared/matchTimer.js — aqui só ficam o estado do cliente e o HUD.
//
// No modo online os valores vêm prontos do servidor (mensagem `state`); no
// modo bot vêm do cronômetro local do próprio loop (bot.js). Quando a partida
// acaba antes do tempo, as atualizações simplesmente param de chegar e o
// relógio congela no último valor — é isso que "pausa" o cronômetro.

import { matchTimerEl } from './dom.js';
import { state } from './state.js';
import { playTimerTickSound, playSuddenDeathSound } from './audio.js';
import { MATCH_DURATION_MS, formatarTempo } from '../../shared/matchTimer.js';

// A partir daqui o relógio fica amarelo, avisando que o tempo está no fim.
const AVISO_MS = 15000;

// Últimos segundos com tique sonoro, um por segundo.
const TIQUES_FINAIS_S = 10;

const TEXTO_DESEMPATE = 'DESEMPATE';

// Último segundo já anunciado, para o tique tocar uma vez por segundo e não a
// cada atualização (que chega a 60x por segundo, do servidor ou do loop local).
let ultimoTique = null;

function tocarTiqueSeVirouSegundo(restanteMs) {
  const segundos = Math.ceil(restanteMs / 1000);
  if (segundos > TIQUES_FINAIS_S) {
    ultimoTique = null;
    return;
  }
  if (segundos <= 0 || segundos === ultimoTique) return;
  ultimoTique = segundos;
  playTimerTickSound(segundos);
}

export function atualizarCronometro(restanteMs, desempate) {
  // Ao congelar a partida o jogador pode estar com teclas pressionadas; sem
  // soltá-las aqui ele continuaria "andando" na predição local e o escudo
  // ficaria erguido na tela até ele largar o espaço.
  if (desempate && !state.desempate) {
    state.input.up = state.input.down = state.input.left = state.input.right = false;
    state.input.shield = false;
    playSuddenDeathSound();
  }
  if (!desempate) tocarTiqueSeVirouSegundo(restanteMs);
  state.remainingMs = restanteMs;
  state.desempate = desempate;
  renderizarCronometro();
}

export function renderizarCronometro() {
  matchTimerEl.textContent = state.desempate ? TEXTO_DESEMPATE : formatarTempo(state.remainingMs);
  matchTimerEl.classList.toggle('desempate', state.desempate);
  matchTimerEl.classList.toggle('warning', !state.desempate && state.remainingMs <= AVISO_MS);
}

export function resetMatchTimer() {
  ultimoTique = null;
  state.remainingMs = MATCH_DURATION_MS;
  state.desempate = false;
  renderizarCronometro();
}
