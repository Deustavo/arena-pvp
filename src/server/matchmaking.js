import { createMatch as createMatchState, disconnectPlayer } from './Match.js';

// Sala de espera: no máximo uma partida se forma por vez, o suficiente para
// o escopo atual do jogo (1x1 simples).
let waitingPlayer = null;
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

// Mesma conta logada em duas abas/sessões não pode cair na mesma partida:
// o resultado seria gravado no histórico e infla o próprio ranking de graça
// (convidados não têm userId, então nunca disparam essa checagem entre si).
function isSameAccount(a, b) {
  return a.userId != null && a.userId === b.userId;
}

function beginWaiting(ws) {
  ws.waiting = true;
  ws.send(JSON.stringify({ type: 'waiting' }));
  ws.waitTimer = setTimeout(() => {
    // O jogador continua na fila (`waitingPlayer` ainda aponta pra ele) —
    // isso só avisa que a espera está demorando. Zerar `ws.waiting` aqui
    // travava "Sair da fila"/"Modo treino" (handleLeaveQueue exige
    // `ws.waiting`) e vazava `waitingPlayer` se o jogador só fechasse a aba.
    ws.send(JSON.stringify({ type: 'noOpponents' }));
  }, WAITING_TIMEOUT_MS);
}

function stopWaiting(ws) {
  ws.waiting = false;
  clearTimeout(ws.waitTimer);
  ws.waitTimer = null;
  if (waitingPlayer === ws) waitingPlayer = null;
}

export function handleConnection(ws, nickname = 'Jogador', classId = 'atirador') {
  ws.nickname = nickname;
  ws.classId = classId;

  if (waitingPlayer !== null && !isSameAccount(waitingPlayer, ws)) {
    const opponent = waitingPlayer;
    stopWaiting(opponent);
    startMatch(opponent, ws);
    return;
  }

  // Fila vazia, ou o único candidato é a própria conta em outra aba/sessão:
  // `ws` espera por conta própria, sem mexer no estado de quem já esperava
  // (se um jogador de verdade entrar depois, casa normalmente com ele).
  beginWaiting(ws);
  if (waitingPlayer === null) waitingPlayer = ws;
}

export function handleLeaveQueue(ws) {
  if (!ws.waiting) return;
  stopWaiting(ws);
  ws.send(JSON.stringify({ type: 'left' }));
}

export function handleDisconnect(ws) {
  if (ws.waiting) {
    stopWaiting(ws);
    return;
  }
  const match = ws.match;
  if (match && match.running) {
    disconnectPlayer(match, ws);
  }
}
