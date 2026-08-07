import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_TIPOS, sortearArena, terremotoAtivo, terremotoProgresso, terremotoIntensidade,
  ventoDirecao, VENTO_FORCA, criarErupcoes, tickErupcoes, ERUPCAO_RAIO, ERUPCAO_KNOCKBACK,
  ERUPCAO_AVISO_MS, ERUPCAO_EXPLOSAO_MS,
  ARENA_FASE_FINAL_MS, ARENA_EVENTO_FIM_MS, faseFinalFator,
} from '../shared/arenaEvents.js';
import { createPlayerState } from '../shared/entities.js';
import { stepPlayers } from '../shared/simulation.js';
import { ARENA, PLAYER_SIZE, PLAYER_SPEED } from '../shared/constants.js';

describe('faseFinalFator', () => {
  test('é 1 fora dos últimos ARENA_FASE_FINAL_MS e maior que 1 dentro deles', () => {
    assert.equal(faseFinalFator(ARENA_FASE_FINAL_MS + 1), 1);
    assert.ok(faseFinalFator(ARENA_FASE_FINAL_MS) > 1);
    assert.ok(faseFinalFator(0) > 1);
  });
});

describe('sortearArena', () => {
  test('sempre devolve um dos quatro tipos', () => {
    for (const valor of [0, 0.25, 0.49, 0.5, 0.99]) {
      assert.ok(ARENA_TIPOS.includes(sortearArena(() => valor)));
    }
  });
});

describe('terremoto (terra)', () => {
  test('fica ativo e inativo em ciclos', () => {
    assert.equal(terremotoAtivo(0), true);
    assert.equal(terremotoAtivo(4499), true);
    assert.equal(terremotoAtivo(4500), false);
    assert.equal(terremotoAtivo(17999), false);
    assert.equal(terremotoAtivo(18000), true); // próximo ciclo
  });

  test('progresso sobe de 0 a quase 1 dentro do tremor, e é null fora dele', () => {
    assert.equal(terremotoProgresso(0), 0);
    assert.equal(terremotoProgresso(2250), 0.5);
    assert.ok(terremotoProgresso(4499) < 1);
    assert.equal(terremotoProgresso(4500), null);
    assert.equal(terremotoProgresso(10000), null);
    assert.equal(terremotoProgresso(18000), 0); // próximo ciclo
  });

  test('não para mais nos últimos ARENA_FASE_FINAL_MS de partida', () => {
    // Na fase final o tremor é contínuo: nenhum instante do ciclo (inclusive os
    // que ficariam de fora no trecho periódico) devolve null.
    for (let agora = 0; agora < 18000; agora += 250) {
      assert.notEqual(
        terremotoProgresso(agora, ARENA_FASE_FINAL_MS),
        null,
        `deveria estar tremendo em ${agora}ms`,
      );
    }
  });

  test('para de vez no último segundo, e não volta no desempate', () => {
    assert.notEqual(terremotoProgresso(0, ARENA_EVENTO_FIM_MS + 1), null);
    assert.equal(terremotoProgresso(0, ARENA_EVENTO_FIM_MS), null);
    assert.equal(terremotoProgresso(2250, 500), null);
    assert.equal(terremotoAtivo(0, 0), false);
  });

  test('a intensidade varia entre ocorrências, não é sempre a mesma', () => {
    const intensidades = new Set([0, 1, 2, 3].map((ciclo) => terremotoIntensidade(ciclo * 18000)));
    assert.ok(intensidades.size > 1, 'ciclos diferentes deveriam ter intensidades diferentes');
  });

  test('fica mais forte nos últimos segundos de partida', () => {
    const foraDaFaseFinal = terremotoIntensidade(0, ARENA_FASE_FINAL_MS + 1);
    const naFaseFinal = terremotoIntensidade(0, ARENA_FASE_FINAL_MS);
    assert.ok(naFaseFinal > foraDaFaseFinal);
  });

  test('é só visual: não muda o movimento em stepPlayers', () => {
    const p = createPlayerState(0);
    p.input.right = true;
    const startX = p.x;
    stepPlayers([p], ARENA, 0, 'terra');
    assert.equal(p.x, startX + PLAYER_SPEED);
  });
});

describe('vento (areia)', () => {
  test('só sopra na arena de areia, alternando direção a cada ciclo', () => {
    assert.equal(ventoDirecao('areia', 0), 1);
    assert.equal(ventoDirecao('areia', 3499), 1);
    assert.equal(ventoDirecao('areia', 3500), 0); // fora da janela ativa do ciclo
    assert.equal(ventoDirecao('areia', 10000), -1); // segundo ciclo, direção invertida
    assert.equal(ventoDirecao('terra', 0), 0);
  });

  test('stepPlayers empurra os dois jogadores na direção do vento', () => {
    const p = createPlayerState(0);
    const startX = p.x;
    stepPlayers([p], ARENA, 0, 'areia');
    assert.equal(p.x, startX + VENTO_FORCA);
  });

  test('empurra mais forte nos últimos segundos de partida', () => {
    const p = createPlayerState(0);
    const startX = p.x;
    stepPlayers([p], ARENA, 0, 'areia', ARENA_FASE_FINAL_MS);
    assert.ok(p.x - startX > VENTO_FORCA);
  });

  test('não para mais nos últimos ARENA_FASE_FINAL_MS de partida', () => {
    // Na fase final não existe mais pausa entre rajadas: nenhum instante do
    // ciclo (inclusive os que ficariam parados no trecho periódico) devolve 0.
    for (let agora = 0; agora < 20000; agora += 250) {
      assert.notEqual(
        ventoDirecao('areia', agora, ARENA_FASE_FINAL_MS),
        0,
        `deveria estar ventando em ${agora}ms`,
      );
    }
  });

  test('para de vez no último segundo, e não volta no desempate', () => {
    assert.notEqual(ventoDirecao('areia', 0, ARENA_EVENTO_FIM_MS + 1), 0);
    assert.equal(ventoDirecao('areia', 0, ARENA_EVENTO_FIM_MS), 0);
    assert.equal(ventoDirecao('areia', 0, 0), 0);
  });
});

describe('gelo', () => {
  test('o movimento desliza em vez de parar instantaneamente', () => {
    const p = createPlayerState(0);
    p.input.right = true;
    stepPlayers([p], ARENA, 0, 'gelo');
    const xComInput = p.x;

    // Solta a tecla: numa arena normal o jogador pararia no lugar.
    p.input.right = false;
    stepPlayers([p], ARENA, 0, 'gelo');
    assert.ok(p.x > xComInput, 'deveria continuar deslizando por embalo');
  });

  test('escorrega mais nos últimos segundos de partida', () => {
    // Mesmo embalo (`vx`) nas duas fases, no meio da arena (sem clampar em
    // nenhuma borda): solta a tecla e compara o quanto sobra desse embalo no
    // tick seguinte — quanto mais perto de 1 o atrito, mais desliza.
    const p1 = createPlayerState(0);
    p1.x = ARENA.w / 2;
    p1.vx = PLAYER_SPEED;
    const xAntesNormal = p1.x;
    stepPlayers([p1], ARENA, 0, 'gelo');
    const deslizeNormal = p1.x - xAntesNormal;

    const p2 = createPlayerState(0);
    p2.x = ARENA.w / 2;
    p2.vx = PLAYER_SPEED;
    const xAntesFinal = p2.x;
    stepPlayers([p2], ARENA, 0, 'gelo', ARENA_FASE_FINAL_MS);
    const deslizeFinal = p2.x - xAntesFinal;

    assert.ok(deslizeFinal > deslizeNormal);
  });
});

describe('erupções (fogo)', () => {
  test('não faz nada fora da arena de fogo', () => {
    const estado = criarErupcoes(() => 0.5);
    const players = [createPlayerState(0), createPlayerState(1)];
    tickErupcoes('terra', estado, players, 45000, 0);
    assert.equal(estado.ativas.length, 0);
  });

  test('cada onda mira os dois jogadores ao mesmo tempo, na posição atual deles', () => {
    const estado = criarErupcoes(() => 0.5); // horário determinístico
    const players = [createPlayerState(0), createPlayerState(1)];
    const item = estado.agenda[0];

    // Ainda não chegou o tempo de surgir.
    tickErupcoes('fogo', estado, players, item.surgeEmRestanteMs + 1, 0);
    assert.equal(estado.ativas.length, 0);

    // As duas surgem juntas em fase de aviso, uma mirada em cada jogador.
    tickErupcoes('fogo', estado, players, item.surgeEmRestanteMs, 0);
    assert.equal(estado.ativas.length, 2);
    assert.ok(estado.ativas.every((e) => e.fase === 'aviso'));
    assert.equal(estado.ativas[0].x, players[0].x + PLAYER_SIZE / 2);
    assert.equal(estado.ativas[0].y, players[0].y + PLAYER_SIZE / 2);
    assert.equal(estado.ativas[1].x, players[1].x + PLAYER_SIZE / 2);
    assert.equal(estado.ativas[1].y, players[1].y + PLAYER_SIZE / 2);
  });

  test('avisa, depois explode e causa dano/knockback em quem ainda está no alvo', () => {
    const estado = criarErupcoes(() => 0.5);
    const players = [createPlayerState(0), createPlayerState(1)];
    const item = estado.agenda[0];
    tickErupcoes('fogo', estado, players, item.surgeEmRestanteMs, 0);

    const alvo = players[0];
    const vidasAntes = alvo.lives;
    const xAntesExplosao = alvo.x;

    // Antes do fim do aviso: continua em aviso, sem dano (o alvo não se mexeu).
    tickErupcoes('fogo', estado, players, item.surgeEmRestanteMs, ERUPCAO_AVISO_MS - 1);
    assert.ok(estado.ativas.every((e) => e.fase === 'aviso'));
    assert.equal(alvo.lives, vidasAntes);

    // Passa do tempo de aviso: as duas explodem, causando dano/knockback em
    // quem ficou dentro.
    tickErupcoes('fogo', estado, players, item.surgeEmRestanteMs, ERUPCAO_AVISO_MS);
    assert.equal(estado.ativas.length, 2);
    assert.ok(estado.ativas.every((e) => e.fase === 'explosao'));
    assert.equal(alvo.lives, vidasAntes - 1);
    assert.notEqual(alvo.x, xAntesExplosao);

    // A explosão fica no snapshot por ERUPCAO_EXPLOSAO_MS (é o que garante que
    // nenhum frame do cliente perca a transição), sem repetir o dano.
    tickErupcoes('fogo', estado, players, item.surgeEmRestanteMs, ERUPCAO_AVISO_MS + ERUPCAO_EXPLOSAO_MS - 1);
    assert.equal(estado.ativas.length, 2);
    assert.equal(alvo.lives, vidasAntes - 1);

    // Passada a janela, somem da lista.
    tickErupcoes('fogo', estado, players, item.surgeEmRestanteMs, ERUPCAO_AVISO_MS + ERUPCAO_EXPLOSAO_MS);
    assert.equal(estado.ativas.length, 0);
  });

  test('nos últimos segundos de partida a onda vem maior e empurra mais forte', () => {
    const estadoNormal = criarErupcoes(() => 0.5);
    const players = [createPlayerState(0), createPlayerState(1)];
    const itemNormal = estadoNormal.agenda[0];
    tickErupcoes('fogo', estadoNormal, players, itemNormal.surgeEmRestanteMs, 0);
    assert.equal(estadoNormal.ativas[0].raio, ERUPCAO_RAIO);
    assert.equal(estadoNormal.ativas[0].knockback, ERUPCAO_KNOCKBACK);

    const estadoFinal = criarErupcoes(() => 0.5);
    const item = estadoFinal.agenda[0];
    tickErupcoes('fogo', estadoFinal, players, Math.min(item.surgeEmRestanteMs, ARENA_FASE_FINAL_MS), 0);
    assert.ok(estadoFinal.ativas[0].raio > ERUPCAO_RAIO);
    assert.ok(estadoFinal.ativas[0].knockback > ERUPCAO_KNOCKBACK);
  });

  test('jogador que sai do alvo antes da explosão não toma dano', () => {
    const estado = criarErupcoes(() => 0.5);
    const players = [createPlayerState(0), createPlayerState(1)];
    const item = estado.agenda[0];
    tickErupcoes('fogo', estado, players, item.surgeEmRestanteMs, 0);

    // O alvo foi marcado na posição de spawn; fugir antes da explosão evita
    // o dano, já que a mira não persegue quem se mexe depois.
    const fugitivo = players[0];
    const vidasAntes = fugitivo.lives;
    fugitivo.x = estado.ativas[0].x - ERUPCAO_RAIO * 5;
    fugitivo.y = estado.ativas[0].y;

    tickErupcoes('fogo', estado, players, item.surgeEmRestanteMs, ERUPCAO_AVISO_MS);
    assert.equal(fugitivo.lives, vidasAntes);
  });
});
