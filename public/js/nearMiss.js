// Som de "tiro passou raspando". Nem o servidor nem a simulação avisam isso —
// um projétil que não acerta simplesmente segue viagem — então a detecção é
// feita no cliente, a cada frame, olhando a distância do projétil inimigo mais
// próximo do jogador local.
//
// Os projéteis chegam sem id (tanto no snapshot do servidor quanto no do modo
// bot), então não dá para acompanhar um projétil específico. O que se acompanha
// é a distância mínima: quando ela para de diminuir e volta a crescer, o tiro
// mais próximo passou do jogador.

import { state } from './state.js';
import { hitFlashUntil } from './hud.js';
import { playNearMissSound } from './audio.js';

// Distância (centro a centro) considerada "raspou". Um pouco maior que o raio
// do escudo, para o efeito valer mesmo com o escudo abaixado.
const NEAR_MISS_PX = 46;
// Um projétil que acerta ou sai da arena desaparece do snapshot, e aí a
// distância mínima "salta" para o próximo projétil (ou para o infinito). Sem
// esse teto, esse salto seria lido como um tiro se afastando.
const SALTO_MAXIMO_PX = 100;

let distanciaAnterior = Infinity;

export function resetNearMiss() {
  distanciaAnterior = Infinity;
}

export function checkNearMiss(renderState, now) {
  if (!state.matchStarted || state.gameOver || state.desempate) return;
  const me = renderState.players[state.playerIndex];
  if (!me || !me.alive) {
    distanciaAnterior = Infinity;
    return;
  }

  const cx = me.x + state.playerSize / 2;
  const cy = me.y + state.playerSize / 2;
  let menorDistancia = Infinity;
  for (const proj of renderState.projectiles) {
    if (proj.ownerIndex === state.playerIndex) continue;
    const d = Math.hypot(proj.x - cx, proj.y - cy);
    if (d < menorDistancia) menorDistancia = d;
  }

  const passouRaspando = distanciaAnterior <= NEAR_MISS_PX
    && menorDistancia > distanciaAnterior
    && menorDistancia < SALTO_MAXIMO_PX;
  // O flash de dano cobre o caso do tiro que acertou: aí quem toca é o som de
  // impacto, não o de raspão.
  if (passouRaspando && hitFlashUntil[state.playerIndex] <= now) {
    playNearMissSound();
  }
  distanciaAnterior = menorDistancia;
}
