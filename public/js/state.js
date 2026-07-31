// Estado mutável compartilhado entre os módulos do cliente. Um jogo deste
// porte não precisa de um gerenciador de estado dedicado — um único objeto
// central, com cada módulo lendo/escrevendo apenas os campos que lhe dizem
// respeito, mantém as coisas simples e fáceis de rastrear.

import {
  ARENA, PLAYER_SIZE, PROJECTILE_SIZE, COLORS, SHIELD_RADIUS,
} from '../../shared/constants.js';
import { DEFAULT_CLASS_ID } from '../../shared/classes.js';

export const state = {
  mode: null, // 'online' | 'bot'
  ws: null,
  playerIndex: null,
  matchId: null,
  nickname: '',
  classId: DEFAULT_CLASS_ID, // classe escolhida no menu para a próxima partida

  // Parâmetros da partida — os valores online vêm do servidor (mensagem
  // `init`) e podem, em tese, divergir das constantes locais.
  arena: ARENA,
  playerSize: PLAYER_SIZE,
  projectileSize: PROJECTILE_SIZE,
  colors: COLORS,
  shieldRadius: SHIELD_RADIUS,
  shieldMaxHits: [1, 1], // cargas de escudo por jogador, dependem da classe

  latestState: { players: [], projectiles: [] },
  gameOver: false,
  matchStarted: false,
  countdownTimer: null,

  // Interpolação de entidades (modo online): renderiza um pouco no passado
  // para manter o movimento suave mesmo com jitter de rede.
  stateBuffer: [],

  // Predição do jogador local: move imediatamente ao input e reconcilia com
  // a posição autoritativa do servidor conforme ela chega.
  predicted: { x: 0, y: 0, initialized: false },
  lastFrameTime: null,

  gameOverAt: 0,
  overlayShown: false,
  lastResult: null, // 'win' | 'lose' | 'draw'
  prevAlive: [true, true],
  explosionParticles: [],

  bot: null,
  botInterval: null,

  input: { up: false, down: false, left: false, right: false, shield: false },
};

// Reseta os campos de uma sessão de partida (chamado ao entrar em uma nova
// partida ou voltar ao menu). Efeitos colaterais de DOM ficam por conta de
// quem chama.
export function resetMatchState() {
  state.playerIndex = null;
  state.matchId = null;
  state.arena = ARENA;
  state.playerSize = PLAYER_SIZE;
  state.projectileSize = PROJECTILE_SIZE;
  state.colors = COLORS;
  state.shieldRadius = SHIELD_RADIUS;
  state.shieldMaxHits = [1, 1];
  state.latestState = { players: [], projectiles: [] };
  state.stateBuffer = [];
  state.predicted = { x: 0, y: 0, initialized: false };
  state.lastFrameTime = null;
  state.gameOver = false;
  state.matchStarted = false;
  state.input.up = state.input.down = state.input.left = state.input.right = state.input.shield = false;
  state.gameOverAt = 0;
  state.overlayShown = false;
  state.lastResult = null;
  state.prevAlive = [true, true];
  state.explosionParticles = [];
}
