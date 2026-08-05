// Estado mutável compartilhado entre os módulos do cliente. Um jogo deste
// porte não precisa de um gerenciador de estado dedicado — um único objeto
// central, com cada módulo lendo/escrevendo apenas os campos que lhe dizem
// respeito, mantém as coisas simples e fáceis de rastrear.

import {
  ARENA, PLAYER_SIZE, PROJECTILE_SIZE, COLORS, SHIELD_RADIUS,
} from '../../shared/constants.js';
import { DEFAULT_CLASS_ID } from '../../shared/classes.js';
import { DEFAULT_BOT_DIFFICULTY } from '../../shared/botDifficulty.js';
import { MATCH_DURATION_MS } from '../../shared/matchTimer.js';
import { resetCharacterAnimators } from './characterSprites.js';

export const state = {
  mode: null, // 'online' | 'bot'
  ws: null,
  pendingTrainingRedirect: false, // true quando o jogador clicou em "Modo treino" a partir do aviso de poucos jogadores online
  playerIndex: null,
  matchId: null,
  nickname: '',

  // Conta logada (null = jogando como convidado). Preenchido por auth.js a
  // partir do token guardado no localStorage. Quando há conta, o nome do
  // jogador vem dela e o campo de nickname do menu fica escondido.
  user: null,

  classId: DEFAULT_CLASS_ID, // classe escolhida no menu para a próxima partida
  botClassId: null, // classe do bot escolhida no modal do modo treino
  botDifficulty: DEFAULT_BOT_DIFFICULTY, // dificuldade do bot escolhida no modal do modo treino

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

  // Cronômetro da partida (ver shared/matchTimer.js). `desempate` é o estado
  // de morte súbita depois que o tempo acaba: a partida fica congelada e os
  // dois jogadores perdem vidas até alguém zerar.
  remainingMs: MATCH_DURATION_MS,
  desempate: false,

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
  winnerIndex: null, // índice do jogador vencedor (null em empate)
  prevAlive: [true, true],
  explosionParticles: [],

  bot: null,
  botInterval: null,

  input: { up: false, down: false, left: false, right: false, shield: false },
  mouse: { x: 0, y: 0 },

  // Direção que o personagem local olha (1 = direita, -1 = esquerda), em
  // espaço de mundo — segue o mouse (ver computeFacing/input.js). Enviado ao
  // servidor no modo online para o oponente ver a mesma direção.
  facing: 1,

  // Se o jogador local está do lado direito do adversário, a cena inteira é
  // espelhada horizontalmente na renderização para que ele sempre apareça à
  // esquerda na tela (ver render.js). A posição/física reais não mudam.
  viewFlipped: false,
};

// Converte uma coordenada X de tela/canvas (ex: posição do mouse) para o
// espaço de mundo usado pela simulação, desfazendo o espelhamento aplicado
// na renderização quando `viewFlipped` está ativo.
export function screenXToWorld(x) {
  return state.viewFlipped ? state.arena.w - x : x;
}

// Decide, uma única vez no início da partida, se a cena deve ser espelhada
// para o jogador local sempre começar do lado esquerdo da tela. Chamado só
// ao iniciar a partida (não a cada frame) para o espelhamento não ficar indo
// e voltando conforme os jogadores se cruzam durante o jogo.
export function computeInitialViewFlip(players, playerIndex) {
  if (playerIndex === null) return false;
  const opp = players[playerIndex === 0 ? 1 : 0];
  const me = players[playerIndex];
  if (!me || !opp) return false;
  return me.x > opp.x;
}

// `state.input.left`/`right` refletem as teclas físicas (A/D, setas) tal
// como o jogador as vê na tela. Quando a cena está espelhada (viewFlipped),
// "esquerda na tela" corresponde a "direita no mundo" — então a física
// (local e do servidor) precisa receber left/right trocados, senão os
// controles horizontais saem invertidos para quem começou do lado direito.
export function getWorldInput() {
  if (!state.viewFlipped) return state.input;
  return { ...state.input, left: state.input.right, right: state.input.left };
}

// Direção (1/-1) que o personagem deveria olhar para encarar `worldMouseX`
// (já em espaço de mundo, ver screenXToWorld) a partir do centro de um
// jogador em `playerX` (canto esquerdo do hitbox, espaço de mundo).
export function computeFacing(worldMouseX, playerX) {
  return worldMouseX >= playerX + PLAYER_SIZE / 2 ? 1 : -1;
}

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
  state.remainingMs = MATCH_DURATION_MS;
  state.desempate = false;
  state.input.up = state.input.down = state.input.left = state.input.right = state.input.shield = false;
  state.facing = 1;
  state.gameOverAt = 0;
  state.overlayShown = false;
  state.lastResult = null;
  state.winnerIndex = null;
  state.prevAlive = [true, true];
  state.explosionParticles = [];
  state.viewFlipped = false;
  resetCharacterAnimators();
}
