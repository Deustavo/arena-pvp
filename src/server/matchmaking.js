import { createMatch as createMatchState, endMatch } from './Match.js';

// Sala de espera: no máximo uma partida se forma por vez, o suficiente para
// o escopo atual do jogo (1x1 simples).
let waitingPlayer = null;
const activeMatches = new Set();

export function activeMatchCount() {
  return activeMatches.size;
}

function onMatchEnd(match) {
  activeMatches.delete(match);
  console.log(`Partida ${match.id} encerrada. Partidas ativas: ${activeMatches.size}`);
}

export function handleConnection(ws, nickname = 'Jogador', classId = 'atirador') {
  ws.nickname = nickname;
  ws.classId = classId;

  if (waitingPlayer === null) {
    waitingPlayer = ws;
    ws.send(JSON.stringify({ type: 'waiting' }));
    return;
  }

  const opponent = waitingPlayer;
  waitingPlayer = null;
  const match = createMatchState(opponent, ws, { onEnd: onMatchEnd });
  activeMatches.add(match);
  console.log(`Partida ${match.id} iniciada. Partidas ativas: ${activeMatches.size}`);
}

export function handleLeaveQueue(ws) {
  if (waitingPlayer === ws) {
    waitingPlayer = null;
    ws.send(JSON.stringify({ type: 'left' }));
  }
}

export function handleDisconnect(ws) {
  if (waitingPlayer === ws) {
    waitingPlayer = null;
    return;
  }
  const match = ws.match;
  if (match && match.running) {
    const remaining = match.players.find((p) => p.ws !== ws);
    endMatch(match, remaining ? remaining.index : null);
  }
}
