import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_DURATION_MS, DESEMPATE_DELAY_MS, DESEMPATE_PASSO_MS,
  criarCronometro, tickCronometro, emDesempate, tempoRestanteMs, adiarFim, formatarTempo,
} from '../shared/matchTimer.js';

function jogadores(vidasA, vidasB) {
  return [
    { lives: vidasA, alive: true },
    { lives: vidasB, alive: true },
  ];
}

describe('tempoRestanteMs', () => {
  test('conta para trás a partir da duração da partida', () => {
    const cronometro = criarCronometro(1000);
    assert.equal(tempoRestanteMs(cronometro, 1000), MATCH_DURATION_MS);
    assert.equal(tempoRestanteMs(cronometro, 1000 + 30_000), MATCH_DURATION_MS - 30_000);
  });

  test('nunca fica negativo e é zero durante o desempate', () => {
    const cronometro = criarCronometro(0);
    assert.equal(tempoRestanteMs(cronometro, MATCH_DURATION_MS + 5000), 0);
    tickCronometro(cronometro, jogadores(3, 3), MATCH_DURATION_MS);
    assert.equal(tempoRestanteMs(cronometro, MATCH_DURATION_MS), 0);
  });
});

describe('adiarFim', () => {
  test('empurra o fim do tempo regulamentar (relógio parado no tutorial)', () => {
    const cronometro = criarCronometro(0);
    adiarFim(cronometro, 5000);
    assert.equal(tempoRestanteMs(cronometro, 0), MATCH_DURATION_MS + 5000);
  });

  test('não faz nada depois que o desempate começou', () => {
    const cronometro = criarCronometro(0);
    tickCronometro(cronometro, jogadores(3, 3), MATCH_DURATION_MS);
    adiarFim(cronometro, 5000);
    assert.equal(emDesempate(cronometro), true);
  });
});

describe('tickCronometro', () => {
  test('não faz nada enquanto o tempo não acaba', () => {
    const cronometro = criarCronometro(0);
    const players = jogadores(3, 3);
    const evento = tickCronometro(cronometro, players, MATCH_DURATION_MS - 1);

    assert.deepEqual(evento, { iniciouDesempate: false, drenou: false, fim: false, winnerIndex: null });
    assert.equal(emDesempate(cronometro), false);
    assert.deepEqual(players.map((p) => p.lives), [3, 3]);
  });

  test('quando o tempo acaba entra em desempate, mas ainda não tira vidas', () => {
    const cronometro = criarCronometro(0);
    const players = jogadores(3, 3);
    const evento = tickCronometro(cronometro, players, MATCH_DURATION_MS);

    assert.equal(evento.iniciouDesempate, true);
    assert.equal(evento.drenou, false);
    assert.equal(emDesempate(cronometro), true);
    assert.deepEqual(players.map((p) => p.lives), [3, 3]);
  });

  test('só começa a drenar depois do respiro inicial', () => {
    const cronometro = criarCronometro(0);
    const players = jogadores(3, 3);
    tickCronometro(cronometro, players, MATCH_DURATION_MS);

    tickCronometro(cronometro, players, MATCH_DURATION_MS + DESEMPATE_DELAY_MS - 1);
    assert.deepEqual(players.map((p) => p.lives), [3, 3]);

    const evento = tickCronometro(cronometro, players, MATCH_DURATION_MS + DESEMPATE_DELAY_MS);
    assert.equal(evento.drenou, true);
    assert.deepEqual(players.map((p) => p.lives), [2, 2]);
  });

  test('tira um coração de cada jogador por passo, e quem zerar primeiro perde', () => {
    const cronometro = criarCronometro(0);
    const players = jogadores(3, 2);
    let agora = MATCH_DURATION_MS;
    tickCronometro(cronometro, players, agora);

    agora += DESEMPATE_DELAY_MS;
    assert.equal(tickCronometro(cronometro, players, agora).fim, false);
    assert.deepEqual(players.map((p) => p.lives), [2, 1]);

    agora += DESEMPATE_PASSO_MS;
    const evento = tickCronometro(cronometro, players, agora);
    assert.deepEqual(players.map((p) => p.lives), [1, 0]);
    assert.equal(evento.fim, true);
    assert.equal(evento.winnerIndex, 0);
    assert.equal(players[1].alive, false);
    assert.equal(players[0].alive, true);
  });

  test('vidas iguais zeram no mesmo passo e o resultado é empate', () => {
    const cronometro = criarCronometro(0);
    const players = jogadores(1, 1);
    let agora = MATCH_DURATION_MS;
    tickCronometro(cronometro, players, agora);

    agora += DESEMPATE_DELAY_MS;
    const evento = tickCronometro(cronometro, players, agora);

    assert.equal(evento.fim, true);
    assert.equal(evento.winnerIndex, null);
    assert.deepEqual(players.map((p) => p.alive), [false, false]);
  });

  test('vida fracionária (dano de meio coração) sobrevive um passo a mais', () => {
    const cronometro = criarCronometro(0);
    const players = jogadores(1.5, 1);
    let agora = MATCH_DURATION_MS;
    tickCronometro(cronometro, players, agora);

    agora += DESEMPATE_DELAY_MS;
    const evento = tickCronometro(cronometro, players, agora);

    assert.deepEqual(players.map((p) => p.lives), [0.5, 0]);
    assert.equal(evento.winnerIndex, 0);
  });
});

describe('formatarTempo', () => {
  test('formata como m:ss, arredondando para cima', () => {
    assert.equal(formatarTempo(MATCH_DURATION_MS), '2:00');
    assert.equal(formatarTempo(59_400), '1:00');
    assert.equal(formatarTempo(9500), '0:10');
    assert.equal(formatarTempo(1), '0:01');
  });

  test('não mostra tempo negativo', () => {
    assert.equal(formatarTempo(0), '0:00');
    assert.equal(formatarTempo(-500), '0:00');
  });
});
