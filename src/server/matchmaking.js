import { createMatch as createMatchState, disconnectPlayer } from './Match.js';

// Sala de espera: no máximo uma partida se forma por vez, o suficiente para
// o escopo atual do jogo (1x1 simples).
let waitingPlayer = null;
let waitingTimer = null;
const activeMatches = new Set();

// Se ninguém mais entrar na fila nesse tempo, avisamos o jogador de que há
// poucos jogadores online e sugerimos o modo treino, em vez de jogá-lo numa
// partida contra bot sem que ele peça.
const WAITING_TIMEOUT_MS = 5000;

export function activeMatchCount() {
  return activeMatches.size;
}

// Metadados públicos das partidas em andamento, para o painel de espectador
// do menu. Só partidas que já passaram da contagem regressiva (`interval`
// existe) — antes disso ainda não há nada de fato pra assistir.
export function listActiveMatches() {
  const matches = [];
  for (const match of activeMatches) {
    if (!match.running || !match.interval) continue;
    matches.push({
      id: match.id,
      players: match.players.map((p) => ({ name: p.name, classId: p.classId })),
    });
  }
  return matches;
}

export function getMatchById(matchId) {
  for (const match of activeMatches) {
    if (match.id === matchId && match.running) return match;
  }
  return null;
}

function onMatchEnd(match) {
  activeMatches.delete(match);
  console.log(`Partida ${match.id} encerrada. Partidas ativas: ${activeMatches.size}`);
}

function startMatch(wsA, wsB, options = {}) {
  const match = createMatchState(wsA, wsB, { onEnd: onMatchEnd, ...options });
  activeMatches.add(match);
  console.log(`Partida ${match.id} iniciada. Partidas ativas: ${activeMatches.size}`);
  return match;
}

function notifyNoOpponents(ws) {
  if (waitingPlayer !== ws) return;
  waitingTimer = null;
  ws.send(JSON.stringify({ type: 'noOpponents' }));
}

export function handleConnection(ws, nickname = 'Jogador', classId = 'atirador') {
  ws.nickname = nickname;
  ws.classId = classId;

  if (waitingPlayer === null) {
    waitingPlayer = ws;
    ws.send(JSON.stringify({ type: 'waiting' }));
    waitingTimer = setTimeout(() => notifyNoOpponents(ws), WAITING_TIMEOUT_MS);
    return;
  }

  clearTimeout(waitingTimer);
  waitingTimer = null;
  const opponent = waitingPlayer;
  waitingPlayer = null;
  startMatch(opponent, ws);
}

export function handleLeaveQueue(ws) {
  if (waitingPlayer === ws) {
    waitingPlayer = null;
    clearTimeout(waitingTimer);
    waitingTimer = null;
    ws.send(JSON.stringify({ type: 'left' }));
  }
}

export function handleDisconnect(ws) {
  if (waitingPlayer === ws) {
    waitingPlayer = null;
    clearTimeout(waitingTimer);
    waitingTimer = null;
    return;
  }
  const match = ws.match;
  if (match && match.running) {
    disconnectPlayer(match, ws);
  }
}
