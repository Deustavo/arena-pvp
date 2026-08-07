import crypto from 'crypto';
import WebSocket from 'ws';
import {
  ARENA, PLAYER_SIZE, PROJECTILE_SIZE, COLORS, TICK_MS, COUNTDOWN_MS,
  SHIELD_RADIUS,
} from '../../shared/constants.js';
import { createPlayerState } from '../../shared/entities.js';
import { DEFAULT_CLASS_ID, getClass } from '../../shared/classes.js';
import { stepPlayers, stepProjectiles } from '../../shared/simulation.js';
import {
  criarPowerups, tickPowerups, buffsRestantes, velocidadeAtual, cooldownDeTiro,
} from '../../shared/powerups.js';
import {
  MATCH_DURATION_MS, criarCronometro, tickCronometro, emDesempate, tempoRestanteMs,
} from '../../shared/matchTimer.js';
import { sortearArena, criarErupcoes, tickErupcoes } from '../../shared/arenaEvents.js';
import { createBotState, tickBot } from './botAI.js';
import { saveMatchResult } from './matchHistory.js';

function makePlayer(ws, index) {
  return {
    ...createPlayerState(index, ws.classId || DEFAULT_CLASS_ID),
    ws,
    index,
    color: COLORS[index],
    name: ws.nickname || 'Jogador',
    // null para convidados; só quem tem conta gera histórico.
    userId: ws.userId ?? null,
  };
}

function playerSnapshot(p, agora = Date.now()) {
  return {
    x: p.x,
    y: p.y,
    lives: p.lives,
    alive: p.alive,
    shielding: p.shielding,
    shieldHits: p.shieldHits,
    shieldMaxHits: p.shieldMaxHits,
    classId: p.classId,
    name: p.name,
    lastShot: p.lastShot,
    facing: p.facing,
    // Velocidade e cooldown já com os power-ups aplicados: o cliente (predição
    // local, barra de cooldown do HUD) usa esses valores prontos em vez de
    // recalcular o buff com o próprio relógio, que não é o do servidor.
    speed: velocidadeAtual(p, agora),
    shotCooldownMs: cooldownDeTiro(p, getClass(p.classId), agora),
    buffs: buffsRestantes(p, agora),
  };
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

// Teto de espectadores por partida: sem isso, qualquer um que souber um
// matchId (público via /api/live-matches) podia abrir conexões sem limite
// nele e multiplicar o broadcast de `state` a 60hz por conexão — nenhuma
// fila, nickname ou conta é exigida pra assistir, então é o caminho mais
// barato de sobrecarregar o servidor.
export const MAX_SPECTATORS_PER_MATCH = 10;

export function createMatch(wsA, wsB, { onEnd, bot = false, botDifficulty = 'intermediario' } = {}) {
  const players = [makePlayer(wsA, 0), makePlayer(wsB, 1)];
  const match = {
    id: crypto.randomUUID(),
    players,
    projectiles: [],
    nextProjectileId: 1,
    running: true,
    interval: null,
    // Só existe depois da contagem regressiva: o tempo regulamentar começa a
    // correr quando a partida de fato começa.
    cronometro: null,
    // Agenda das bolhas de power-up da partida (tipo, posição e tempo
    // restante em que aparecem), sorteada aqui porque o servidor é a única
    // fonte de verdade — ver shared/powerups.js.
    powerups: criarPowerups(),
    // Arena sorteada para a partida e, se for a de fogo, a agenda das
    // erupções (posição e horário) — ver shared/arenaEvents.js. Nas outras
    // arenas `erupcoes.ativas` fica sempre vazio.
    arenaTipo: sortearArena(),
    erupcoes: criarErupcoes(),
    onEnd,
    bot,
    botState: bot ? createBotState(botDifficulty) : null,
    // Sockets assistindo a partida em modo leitura (ver attachSpectator).
    // Nunca recebem `ws.player`/`ws.match` — só entram no broadcast de estado.
    spectators: new Set(),
  };

  players.forEach((p, i) => {
    p.ws.match = match;
    p.ws.player = p;
    send(p.ws, {
      type: 'init',
      matchId: match.id,
      playerIndex: i,
      arena: ARENA,
      arenaTipo: match.arenaTipo,
      playerSize: PLAYER_SIZE,
      projectileSize: PROJECTILE_SIZE,
      colors: COLORS,
      countdownMs: COUNTDOWN_MS,
      matchDurationMs: MATCH_DURATION_MS,
      shieldRadius: SHIELD_RADIUS,
      players: players.map(playerSnapshot),
    });
  });

  setTimeout(() => {
    if (!match.running) return;
    for (const p of match.players) send(p.ws, { type: 'start' });
    match.cronometro = criarCronometro(Date.now());
    match.interval = setInterval(() => tick(match), TICK_MS);
  }, COUNTDOWN_MS);

  return match;
}

function tick(match) {
  if (!match.running) return;

  const agora = Date.now();
  const evento = tickCronometro(match.cronometro, match.players, agora);
  if (evento.iniciouDesempate) congelarPartida(match);
  if (emDesempate(match.cronometro)) {
    // Partida congelada: ninguém se move nem atira, só os corações caem. O
    // último estado é enviado antes do gameover para o cliente ver a
    // explosão de quem zerou (nos dois, em caso de empate).
    broadcastState(match);
    if (evento.fim) endMatch(match, evento.winnerIndex);
    return;
  }

  if (match.bot) tickBot(match);
  stepPlayers(match.players, ARENA, agora, match.arenaTipo);
  const restanteMs = tempoRestanteMs(match.cronometro, agora);
  // Depois de mover: quem entrou na bolha neste tick já leva o power-up.
  tickPowerups(match.powerups, match.players, restanteMs, agora);
  // Erupções (arena de fogo) podem matar um ou os dois jogadores no mesmo
  // tick — sem projétil e sem `onPlayerDown`, então o fim de partida é
  // decidido aqui, olhando quem ainda está vivo depois do dano.
  tickErupcoes(match.arenaTipo, match.erupcoes, match.players, restanteMs, agora);
  const [p0, p1] = match.players;
  if (!p0.alive || !p1.alive) {
    broadcastState(match);
    endMatch(match, !p0.alive && !p1.alive ? null : (p0.alive ? 0 : 1));
    return;
  }

  match.projectiles = stepProjectiles(match.projectiles, match.players, ARENA, (winnerIndex) => {
    endMatch(match, winnerIndex);
  });

  broadcastState(match);
}

// Fim do tempo regulamentar: a partida para no lugar. Os tiros que estavam no
// ar são descartados para ninguém morrer por um projétil disparado antes do
// congelamento — a partir daqui só o desempate decide.
function congelarPartida(match) {
  match.projectiles = [];
  // No desempate ninguém mais anda: uma bolha na arena só ficaria lá parada,
  // impossível de pegar. Mesma ideia para uma erupção em aviso: sem
  // stepPlayers rodando, nem faria sentido ela terminar de explodir.
  match.powerups.ativos = [];
  match.erupcoes.ativas = [];
  for (const p of match.players) {
    p.input = { up: false, down: false, left: false, right: false };
    p.shielding = false;
  }
}

function broadcastState(match) {
  const agora = Date.now();
  const state = {
    type: 'state',
    players: match.players.map((p) => playerSnapshot(p, agora)),
    projectiles: match.projectiles.map((proj) => ({ x: proj.x, y: proj.y, ownerIndex: proj.ownerIndex, size: proj.size })),
    powerups: match.powerups.ativos,
    erupcoes: match.erupcoes.ativas,
    remainingMs: tempoRestanteMs(match.cronometro, agora),
    desempate: emDesempate(match.cronometro),
  };
  const payload = JSON.stringify(state);
  for (const p of match.players) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
  }
  for (const ws of match.spectators) send(ws, state);
}

// Espectador entra em modo leitura: recebe o mesmo `init` que os jogadores
// (sem `playerIndex`, já que não há "seu" personagem) com o snapshot atual —
// a partida pode já estar em andamento havia algum tempo quando ele chega —
// e a partir daí só acompanha o broadcast de `state` de broadcastState acima.
// Devolve `false` (sem adicionar) quando a partida já está no teto de
// MAX_SPECTATORS_PER_MATCH — quem chama fecha a conexão nesse caso.
export function attachSpectator(match, ws) {
  if (match.spectators.size >= MAX_SPECTATORS_PER_MATCH) return false;
  match.spectators.add(ws);
  send(ws, {
    type: 'init',
    matchId: match.id,
    playerIndex: null,
    arena: ARENA,
    arenaTipo: match.arenaTipo,
    playerSize: PLAYER_SIZE,
    projectileSize: PROJECTILE_SIZE,
    colors: COLORS,
    shieldRadius: SHIELD_RADIUS,
    matchDurationMs: MATCH_DURATION_MS,
    players: match.players.map((p) => playerSnapshot(p)),
    // A partida pode já ter bolhas/erupções na arena quando o espectador chega.
    powerups: match.powerups.ativos,
    erupcoes: match.erupcoes.ativas,
  });
  return true;
}

export function detachSpectator(match, ws) {
  match.spectators.delete(ws);
}

export function endMatch(match, winnerIndex) {
  if (!match.running) return;
  match.running = false;
  clearInterval(match.interval);
  for (const p of match.players) send(p.ws, { type: 'gameover', winnerIndex });
  for (const ws of match.spectators) send(ws, { type: 'gameover', winnerIndex });
  // Gravação em segundo plano: o fim da partida não espera o banco.
  saveMatchResult(match, winnerIndex);
  if (match.onEnd) match.onEnd(match, winnerIndex);
}

// Quando um jogador some (fecha a aba, cai a conexão), fazemos o personagem
// dele "morrer" (broadcast de um último state com alive: false) antes do
// gameover, para que o adversário veja a explosão em vez do jogo simplesmente
// parar.
export function disconnectPlayer(match, ws) {
  if (!match.running) return;
  const disconnected = match.players.find((p) => p.ws === ws);
  const remaining = match.players.find((p) => p.ws !== ws);
  if (disconnected && disconnected.alive) {
    disconnected.alive = false;
    disconnected.lives = 0;
    broadcastState(match);
  }
  endMatch(match, remaining ? remaining.index : null);
}
