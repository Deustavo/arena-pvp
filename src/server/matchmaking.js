import WebSocket from 'ws';
import { createMatch as createMatchState, endMatch } from './Match.js';
import { CLASSES, getClass } from '../../shared/classes.js';

// Sala de espera: no máximo uma partida se forma por vez, o suficiente para
// o escopo atual do jogo (1x1 simples).
let waitingPlayer = null;
let waitingTimer = null;
const activeMatches = new Set();

// Se ninguém mais entrar na fila nesse tempo, o jogador cai numa partida
// contra um bot em vez de ficar esperando indefinidamente.
const BOT_MATCH_DELAY_MS = 5000;
const BOT_DIFFICULTY = 'intermediario';

export function activeMatchCount() {
  return activeMatches.size;
}

function onMatchEnd(match) {
  activeMatches.delete(match);
  console.log(`Partida ${match.id} encerrada. Partidas ativas: ${activeMatches.size}`);
}

function pickRandomClassId() {
  const ids = Object.keys(CLASSES);
  return ids[Math.floor(Math.random() * ids.length)];
}

// "Jogador" falso usado como oponente quando não há ninguém na fila. Não é
// um WebSocket de verdade: só precisa parecer um o suficiente para o que
// Match.js espera (nickname/classId na criação, send/readyState no envio de
// estado, que aqui viram no-ops).
function createBotOpponent() {
  const classId = pickRandomClassId();
  return {
    nickname: `[BOT] ${getClass(classId).name}`,
    classId,
    readyState: WebSocket.OPEN,
    send() {},
  };
}

function startMatch(wsA, wsB, options = {}) {
  const match = createMatchState(wsA, wsB, { onEnd: onMatchEnd, ...options });
  activeMatches.add(match);
  console.log(`Partida ${match.id} iniciada. Partidas ativas: ${activeMatches.size}`);
  return match;
}

function startBotMatch(ws) {
  if (waitingPlayer !== ws) return;
  waitingPlayer = null;
  waitingTimer = null;
  startMatch(ws, createBotOpponent(), { bot: true, botDifficulty: BOT_DIFFICULTY });
}

export function handleConnection(ws, nickname = 'Jogador', classId = 'atirador') {
  ws.nickname = nickname;
  ws.classId = classId;

  if (waitingPlayer === null) {
    waitingPlayer = ws;
    ws.send(JSON.stringify({ type: 'waiting' }));
    waitingTimer = setTimeout(() => startBotMatch(ws), BOT_MATCH_DELAY_MS);
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
    const remaining = match.players.find((p) => p.ws !== ws);
    endMatch(match, remaining ? remaining.index : null);
  }
}
