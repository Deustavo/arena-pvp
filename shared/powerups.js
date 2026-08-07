// Power-ups que surgem na arena durante a partida.
//
// Quatro bolhas por partida, sorteadas em posição (dentro do círculo central da
// arena) e em tipo. Como mexem em vidas, escudo, cadência e velocidade, são
// regra de jogo e moram aqui em shared/ — a mesma função é usada pelo servidor
// (partidas online) e pelo loop do modo treino no cliente, e o bot decide se
// vale a pena ir buscar em shared/botStrategy.js.
//
// O agendamento é feito em **tempo restante** (e não em "instante absoluto"),
// para acompanhar de graça o relógio que não corre: durante o tutorial
// interativo o tempo é empurrado para frente a cada tick (adiarFim em
// matchTimer.js), e o tempo restante fica parado perto do máximo — nenhum
// power-up aparece enquanto o jogador está aprendendo os controles.

import { ARENA, PLAYER_SIZE, PLAYER_SPEED } from './constants.js';
import { circleHitsRect } from './physics.js';

// Raio da bolha desenhada na arena (também o raio de coleta).
export const POWERUP_RADIUS = 20;

// Região de spawn: círculo no centro da arena. Fica no meio de propósito —
// nenhum dos dois jogadores nasce perto, então todo power-up é disputado.
export const POWERUP_ZONE = { x: ARENA.w / 2, y: ARENA.h / 2, r: 150 };

// Vida ganha entre 1 e 3 corações; escudo devolve 1 carga.
export const VIDA_MIN = 1;
export const VIDA_MAX = 3;
export const ESCUDO_CARGAS = 1;

export const BUFF_DURACAO_MS = 10000;
// Cadência: cooldown de tiro pela metade (+ recarga instantânea na coleta).
export const CADENCIA_FATOR = 0.5;
export const VELOCIDADE_FATOR = 1.4;

export const POWERUP_TIPOS = ['vida', 'escudo', 'cadencia', 'velocidade'];

// Janelas de spawn, em tempo restante de partida: 0:52–0:44, 0:40–0:32,
// 0:28–0:20 e 0:16–0:08. Quatro janelas de 8s espaçadas por 4s, para as bolhas
// ficarem distribuídas pelo minuto inteiro sem duas nascerem quase juntas.
export const JANELAS_SPAWN_MS = [
  { de: 52000, ate: 44000 },
  { de: 40000, ate: 32000 },
  { de: 28000, ate: 20000 },
  { de: 16000, ate: 8000 },
];

function entre(rng, min, max) {
  return min + rng() * (max - min);
}

// Ponto uniforme dentro do círculo de spawn (a raiz quadrada evita concentrar
// os sorteios no centro), com folga para a bolha caber inteira na região.
function sortearPosicao(rng) {
  const raio = Math.sqrt(rng()) * (POWERUP_ZONE.r - POWERUP_RADIUS);
  const angulo = rng() * Math.PI * 2;
  return {
    x: POWERUP_ZONE.x + Math.cos(angulo) * raio,
    y: POWERUP_ZONE.y + Math.sin(angulo) * raio,
  };
}

function sortearTipo(rng) {
  const tipo = POWERUP_TIPOS[Math.floor(rng() * POWERUP_TIPOS.length)] ?? 'vida';
  const quantidade = tipo === 'vida'
    ? Math.floor(entre(rng, VIDA_MIN, VIDA_MAX + 1))
    : ESCUDO_CARGAS;
  return { tipo, quantidade };
}

// Sorteia toda a agenda da partida de uma vez (tipo, posição e o tempo
// restante em que cada bolha aparece). No modo online quem sorteia é o
// servidor, que é a única fonte de verdade — o cliente só desenha o que vem
// no snapshot.
export function criarPowerups(rng = Math.random) {
  return {
    agenda: JANELAS_SPAWN_MS.map((janela) => ({
      surgeEmRestanteMs: entre(rng, janela.ate, janela.de),
      surgiu: false,
      ...sortearTipo(rng),
      ...sortearPosicao(rng),
    })),
    ativos: [],
    proximoId: 1,
  };
}

// Bolha do passo de power-up do tutorial interativo. A agenda normal nunca
// dispara durante o tutorial (o relógio não corre, ver o comentário do topo),
// então a bolha do tutorial é criada na mão pelo dono do loop — sempre no
// centro da zona de spawn, que é o lugar onde as bolhas de verdade nascem.
// O tipo é fixo em velocidade de propósito: é o único efeito que passa
// sozinho, então aprender a pegar a bolha não muda os corações nem as cargas
// de escudo com que o jogador entra na partida de verdade.
export const POWERUP_TUTORIAL_TIPO = 'velocidade';

export function criarPowerupTutorial(id) {
  return {
    id,
    tipo: POWERUP_TUTORIAL_TIPO,
    quantidade: 1,
    x: POWERUP_ZONE.x,
    y: POWERUP_ZONE.y,
  };
}

export function aplicarPowerup(player, powerup, agora) {
  switch (powerup.tipo) {
    case 'vida':
      // Passa do máximo da classe de propósito: preenche os corações que
      // faltam e coloca a mais se já estiver cheio (o HUD faz a fileira
      // crescer, ver updateHeartsRow em hud.js).
      player.lives += powerup.quantidade;
      break;
    case 'escudo':
      // Mesma ideia da vida: devolve uma carga gasta ou, com o escudo cheio,
      // aumenta o teto de cargas.
      if (player.shieldHits > 0) player.shieldHits -= 1;
      else player.shieldMaxHits += powerup.quantidade;
      break;
    case 'cadencia':
      player.buffs.cadenciaAte = agora + BUFF_DURACAO_MS;
      // Recarga instantânea: o tiro fica pronto no momento da coleta.
      player.lastShot = 0;
      break;
    case 'velocidade':
      player.buffs.velocidadeAte = agora + BUFF_DURACAO_MS;
      break;
  }
}

// Um passo dos power-ups, chamado a cada tick da partida depois de mover os
// jogadores. Devolve o que aconteceu no tick para quem chama decidir o que
// fazer (hoje ninguém precisa, mas é a mesma convenção de tickCronometro).
export function tickPowerups(estado, players, restanteMs, agora) {
  const eventos = { surgiram: [], coletados: [] };
  if (!estado) return eventos;

  for (const item of estado.agenda) {
    if (item.surgiu || restanteMs > item.surgeEmRestanteMs) continue;
    item.surgiu = true;
    const ativo = {
      id: estado.proximoId++,
      tipo: item.tipo,
      quantidade: item.quantidade,
      x: item.x,
      y: item.y,
    };
    estado.ativos.push(ativo);
    eventos.surgiram.push(ativo);
  }

  if (!estado.ativos.length) return eventos;

  estado.ativos = estado.ativos.filter((pu) => {
    // Os dois podem tocar a bolha no mesmo tick; o primeiro da lista leva.
    const dono = players.find((p) => p.alive && circleHitsRect(
      pu.x, pu.y, POWERUP_RADIUS, p.x, p.y, PLAYER_SIZE, PLAYER_SIZE
    ));
    if (!dono) return true;
    aplicarPowerup(dono, pu, agora);
    eventos.coletados.push({ ...pu, playerIndex: players.indexOf(dono) });
    return false;
  });

  return eventos;
}

export function cadenciaAtiva(player, agora) {
  return (player?.buffs?.cadenciaAte ?? 0) > agora;
}

export function velocidadeAtiva(player, agora) {
  return (player?.buffs?.velocidadeAte ?? 0) > agora;
}

// Cooldown de tiro efetivo do jogador (com o power-up de cadência, metade do
// da classe). Usado pelos dois lados autoritativos (wsServer.js e bot.js) e
// pelo HUD, que recebe o valor já calculado no snapshot.
export function cooldownDeTiro(player, cls, agora) {
  const base = cls.shotCooldownMs;
  return cadenciaAtiva(player, agora) ? base * CADENCIA_FATOR : base;
}

export function velocidadeAtual(player, agora) {
  const base = player.speed ?? PLAYER_SPEED;
  return velocidadeAtiva(player, agora) ? base * VELOCIDADE_FATOR : base;
}

// Quanto falta de cada buff, em milissegundos. Vai no snapshot em vez do
// instante de expiração porque o relógio do cliente não é o do servidor: um
// timestamp absoluto ficaria alguns segundos deslocado e o efeito visual
// (personagem piscando) apagaria na hora errada.
export function buffsRestantes(player, agora) {
  return {
    cadenciaMs: Math.max(0, (player?.buffs?.cadenciaAte ?? 0) - agora),
    velocidadeMs: Math.max(0, (player?.buffs?.velocidadeAte ?? 0) - agora),
  };
}
