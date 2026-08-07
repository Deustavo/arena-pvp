import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  criarPowerups, criarPowerupTutorial, tickPowerups, aplicarPowerup, cooldownDeTiro, velocidadeAtual,
  buffsRestantes, cadenciaAtiva, velocidadeAtiva,
  POWERUP_RADIUS, POWERUP_ZONE, JANELAS_SPAWN_MS, BUFF_DURACAO_MS,
  CADENCIA_FATOR, VELOCIDADE_FATOR, VIDA_MIN, VIDA_MAX,
} from '../shared/powerups.js';
import { createPlayerState } from '../shared/entities.js';
import { CLASSES, getClass } from '../shared/classes.js';
import { PLAYER_SIZE, PLAYER_SPEED } from '../shared/constants.js';
import { escolherPowerupAlvo, movimentoParaPowerup } from '../shared/botStrategy.js';

// rng determinístico: devolve os valores da lista em ordem e repete o último.
function rngFake(valores) {
  let i = 0;
  return () => valores[Math.min(i++, valores.length - 1)];
}

describe('criarPowerups', () => {
  test('agenda quatro bolhas, uma por janela de tempo', () => {
    const { agenda } = criarPowerups(rngFake([0.5]));
    assert.equal(agenda.length, 4);
    assert.equal(agenda.length, JANELAS_SPAWN_MS.length);
    agenda.forEach((item, i) => {
      const janela = JANELAS_SPAWN_MS[i];
      assert.ok(item.surgeEmRestanteMs <= janela.de, 'não pode surgir antes da janela');
      assert.ok(item.surgeEmRestanteMs >= janela.ate, 'não pode surgir depois da janela');
    });
  });

  test('sorteia posição dentro do círculo central, com a bolha inteira dentro', () => {
    for (let i = 0; i < 200; i++) {
      const { agenda } = criarPowerups();
      for (const item of agenda) {
        const dist = Math.hypot(item.x - POWERUP_ZONE.x, item.y - POWERUP_ZONE.y);
        assert.ok(dist <= POWERUP_ZONE.r - POWERUP_RADIUS + 1e-9, `fora da zona: ${dist}`);
      }
    }
  });

  test('power-up de vida vale entre 1 e 3 corações', () => {
    for (let i = 0; i < 500; i++) {
      const { agenda } = criarPowerups();
      for (const item of agenda) {
        if (item.tipo !== 'vida') continue;
        assert.ok(Number.isInteger(item.quantidade));
        assert.ok(item.quantidade >= VIDA_MIN && item.quantidade <= VIDA_MAX);
      }
    }
  });
});

describe('tickPowerups', () => {
  // Agenda de teste com uma bolha só, num tipo e posição fixos.
  function estadoCom(tipo, quantidade, x, y, surgeEmRestanteMs = 45000) {
    return {
      agenda: [{ tipo, quantidade, x, y, surgeEmRestanteMs, surgiu: false }],
      ativos: [],
      proximoId: 1,
    };
  }

  test('não surge antes da hora e surge quando o tempo restante chega na marca', () => {
    const estado = estadoCom('vida', 2, 400, 300);
    const players = [createPlayerState(0), createPlayerState(1)];

    let eventos = tickPowerups(estado, players, 46000, 1000);
    assert.equal(eventos.surgiram.length, 0);
    assert.equal(estado.ativos.length, 0);

    eventos = tickPowerups(estado, players, 45000, 1000);
    assert.equal(eventos.surgiram.length, 1);
    assert.equal(estado.ativos.length, 1);
    assert.deepEqual(
      { tipo: estado.ativos[0].tipo, x: estado.ativos[0].x },
      { tipo: 'vida', x: 400 },
    );
  });

  test('surge uma única vez', () => {
    const estado = estadoCom('vida', 1, 400, 300);
    const players = [createPlayerState(0), createPlayerState(1)];
    tickPowerups(estado, players, 45000, 1000);
    estado.ativos = []; // como se alguém tivesse pegado
    const eventos = tickPowerups(estado, players, 30000, 2000);
    assert.equal(eventos.surgiram.length, 0);
  });

  test('nada acontece enquanto ninguém toca a bolha', () => {
    const estado = estadoCom('vida', 1, 400, 300);
    const players = [createPlayerState(0), createPlayerState(1)];
    const eventos = tickPowerups(estado, players, 45000, 1000);
    assert.equal(eventos.coletados.length, 0);
    assert.equal(estado.ativos.length, 1);
  });

  test('jogador em cima da bolha coleta e ela sai da arena', () => {
    const estado = estadoCom('vida', 2, 400, 300);
    const players = [createPlayerState(0), createPlayerState(1)];
    players[0].x = 400 - PLAYER_SIZE / 2;
    players[0].y = 300 - PLAYER_SIZE / 2;
    const vidasAntes = players[0].lives;

    const eventos = tickPowerups(estado, players, 45000, 1000);
    assert.equal(eventos.coletados.length, 1);
    assert.equal(eventos.coletados[0].playerIndex, 0);
    assert.equal(estado.ativos.length, 0);
    assert.equal(players[0].lives, vidasAntes + 2);
  });

  test('jogador morto não coleta', () => {
    const estado = estadoCom('vida', 2, 400, 300);
    const players = [createPlayerState(0), createPlayerState(1)];
    players[0].x = 400 - PLAYER_SIZE / 2;
    players[0].y = 300 - PLAYER_SIZE / 2;
    players[0].alive = false;
    const eventos = tickPowerups(estado, players, 45000, 1000);
    assert.equal(eventos.coletados.length, 0);
    assert.equal(estado.ativos.length, 1);
  });

  test('estado nulo (partida sem power-ups) não quebra', () => {
    const eventos = tickPowerups(null, [], 45000, 1000);
    assert.deepEqual(eventos, { surgiram: [], coletados: [] });
  });
});

describe('aplicarPowerup', () => {
  test('vida passa do máximo da classe', () => {
    const p = createPlayerState(0, 'assassino');
    const maximoDaClasse = CLASSES.assassino.maxLives;
    aplicarPowerup(p, { tipo: 'vida', quantidade: 3 }, 1000);
    assert.equal(p.lives, maximoDaClasse + 3);
  });

  test('vida preenche os corações perdidos', () => {
    const p = createPlayerState(0, 'tank');
    p.lives -= 4;
    const antes = p.lives;
    aplicarPowerup(p, { tipo: 'vida', quantidade: 2 }, 1000);
    assert.equal(p.lives, antes + 2);
  });

  test('escudo devolve uma carga gasta antes de aumentar o teto', () => {
    const p = createPlayerState(0, 'mago');
    const teto = p.shieldMaxHits;
    p.shieldHits = 2;
    aplicarPowerup(p, { tipo: 'escudo', quantidade: 1 }, 1000);
    assert.equal(p.shieldHits, 1);
    assert.equal(p.shieldMaxHits, teto);
  });

  test('escudo cheio aumenta o teto de cargas', () => {
    const p = createPlayerState(0, 'atirador');
    const teto = p.shieldMaxHits;
    aplicarPowerup(p, { tipo: 'escudo', quantidade: 1 }, 1000);
    assert.equal(p.shieldHits, 0);
    assert.equal(p.shieldMaxHits, teto + 1);
  });

  test('cadência corta o cooldown pela metade por 10s e recarrega na hora', () => {
    const p = createPlayerState(0, 'tank');
    const cls = getClass('tank');
    const agora = 10_000;
    p.lastShot = agora - 10; // acabou de atirar
    aplicarPowerup(p, { tipo: 'cadencia', quantidade: 1 }, agora);

    assert.equal(p.lastShot, 0, 'recarga instantânea');
    assert.equal(cooldownDeTiro(p, cls, agora), cls.shotCooldownMs * CADENCIA_FATOR);
    assert.equal(cadenciaAtiva(p, agora + BUFF_DURACAO_MS - 1), true);
    // Expirado: volta ao cooldown da classe.
    assert.equal(cadenciaAtiva(p, agora + BUFF_DURACAO_MS), false);
    assert.equal(cooldownDeTiro(p, cls, agora + BUFF_DURACAO_MS), cls.shotCooldownMs);
  });

  test('velocidade aumenta 40% por 10s', () => {
    const p = createPlayerState(0, 'atirador');
    const agora = 10_000;
    aplicarPowerup(p, { tipo: 'velocidade', quantidade: 1 }, agora);

    assert.equal(velocidadeAtiva(p, agora + 1), true);
    assert.equal(velocidadeAtual(p, agora + 1), PLAYER_SPEED * VELOCIDADE_FATOR);
    assert.equal(velocidadeAtual(p, agora + BUFF_DURACAO_MS), PLAYER_SPEED);
  });

  // O snapshot leva o tempo que falta, não o instante de expiração: o relógio
  // do cliente não é o do servidor (ver buffsRestantes).
  test('buffsRestantes conta o que falta e nunca fica negativo', () => {
    const p = createPlayerState(0);
    aplicarPowerup(p, { tipo: 'velocidade', quantidade: 1 }, 1000);
    assert.deepEqual(buffsRestantes(p, 1000), { cadenciaMs: 0, velocidadeMs: BUFF_DURACAO_MS });
    assert.deepEqual(buffsRestantes(p, 3000), { cadenciaMs: 0, velocidadeMs: BUFF_DURACAO_MS - 2000 });
    assert.deepEqual(buffsRestantes(p, 999_999), { cadenciaMs: 0, velocidadeMs: 0 });
  });
});

describe('criarPowerupTutorial', () => {
  test('nasce no centro da zona de spawn e não muda vida nem escudo', () => {
    const pu = criarPowerupTutorial(7);
    assert.equal(pu.id, 7);
    assert.equal(pu.x, POWERUP_ZONE.x);
    assert.equal(pu.y, POWERUP_ZONE.y);
    // Vida/escudo mudariam com o que o jogador entra na partida de verdade.
    assert.ok(pu.tipo !== 'vida' && pu.tipo !== 'escudo');
  });

  test('é coletável pela mesma regra dos power-ups normais', () => {
    const estado = { agenda: [], ativos: [criarPowerupTutorial(1)], proximoId: 2 };
    const player = createPlayerState(0, 'atirador');
    player.x = POWERUP_ZONE.x - PLAYER_SIZE / 2;
    player.y = POWERUP_ZONE.y - PLAYER_SIZE / 2;

    const eventos = tickPowerups(estado, [player], 60_000, 1000);

    assert.equal(eventos.coletados.length, 1);
    assert.equal(eventos.coletados[0].playerIndex, 0);
    assert.equal(estado.ativos.length, 0);
  });
});

describe('bot indo buscar power-up', () => {
  const bolha = (x, y, id = 1) => ({ id, tipo: 'vida', quantidade: 1, x, y });

  test('busca a bolha quando está mais perto que o jogador', () => {
    const bot = { x: 380, y: 300 };
    const player = { x: 100, y: 300 };
    const alvo = escolherPowerupAlvo(bot, player, [bolha(420, 300)]);
    assert.ok(alvo);
  });

  test('ignora a bolha que o jogador vai pegar primeiro', () => {
    const bot = { x: 700, y: 300 };
    const player = { x: 380, y: 300 };
    assert.equal(escolherPowerupAlvo(bot, player, [bolha(420, 300)]), null);
  });

  test('sem bolha na arena não há alvo', () => {
    const bot = { x: 380, y: 300 };
    const player = { x: 100, y: 300 };
    assert.equal(escolherPowerupAlvo(bot, player, []), null);
    assert.equal(escolherPowerupAlvo(bot, player, undefined), null);
  });

  test('escolhe a bolha mais próxima entre as disputáveis', () => {
    const bot = { x: 400, y: 300 };
    const player = { x: 0, y: 0 };
    const alvo = escolherPowerupAlvo(bot, player, [bolha(500, 300, 1), bolha(430, 300, 2)]);
    assert.equal(alvo.id, 2);
  });

  test('anda nos dois eixos em direção à bolha', () => {
    const bot = { x: 300, y: 400 };
    const rumo = movimentoParaPowerup(bot, bolha(500, 200));
    assert.deepEqual(rumo, { left: false, right: true, up: true, down: false });
  });
});
