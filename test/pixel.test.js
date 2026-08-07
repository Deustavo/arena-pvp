// public/js/pixel.js é a base de desenho em pixel art do canvas. Não toca no
// DOM (recebe o contexto por parâmetro), então dá para testar as primitivas
// direto, com um contexto falso que só anota os retângulos pedidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PX, snap, pxCirculo, pxAnel, pxGrade, pxTexto, pxLarguraTexto, pxTextoCentro,
  alphaEmDegraus,
} from '../public/js/pixel.js';

function ctxFalso() {
  return {
    rects: [],
    fillStyle: null,
    fillRect(x, y, w, h) {
      this.rects.push({ x, y, w, h, cor: this.fillStyle });
    },
  };
}

// Todo retângulo desenhado tem que cair na grade: é isso que separa a arte
// nítida de uma borda cinza anti-aliased.
function todosNaGrade(ctx) {
  return ctx.rects.every((r) => r.x % PX === 0 && r.y % PX === 0);
}

test('snap trava valores fracionários na grade', () => {
  assert.equal(snap(0), 0);
  assert.equal(snap(1), 0);
  assert.equal(snap(3), 4);
  assert.equal(snap(-3), -4);
  assert.equal(snap(17.9), 16);
});

test('pxCirculo preenche só o que está dentro do raio, alinhado à grade', () => {
  const ctx = ctxFalso();
  pxCirculo(ctx, 100, 100, 20, '#fff');
  assert.ok(ctx.rects.length > 0);
  assert.ok(todosNaGrade(ctx));
  for (const r of ctx.rects) {
    const dx = r.x + PX / 2 - 100;
    const dy = r.y + PX / 2 - 100;
    assert.ok(Math.hypot(dx, dy) <= 20 + PX, 'bloco fora do raio');
  }
});

test('pxAnel deixa o miolo vazio', () => {
  const ctx = ctxFalso();
  pxAnel(ctx, 0, 0, 40, PX * 2, '#fff');
  const noMiolo = ctx.rects.filter((r) => Math.hypot(r.x, r.y) < 40 - PX * 3);
  assert.equal(noMiolo.length, 0);
});

// O escudo desenha os segmentos de carga a partir de -π/2, então o trecho
// cruza o zero: é o caso que uma comparação ingênua de ângulos erra.
test('pxAnel desenha trecho que cruza o zero', () => {
  const ctx = ctxFalso();
  const inicio = -Math.PI / 2;
  pxAnel(ctx, 0, 0, 40, PX * 2, '#fff', inicio, inicio + Math.PI / 2);
  assert.ok(ctx.rects.length > 0, 'trecho não desenhou nada');
  // Esse quarto de volta vai do topo até a direita: nada pode aparecer à
  // esquerda nem abaixo do centro.
  for (const r of ctx.rects) {
    assert.ok(r.x >= -PX, 'bloco à esquerda do centro');
    assert.ok(r.y <= PX, 'bloco abaixo do centro');
  }
});

test('pxAnel completo cobre as quatro direções', () => {
  const ctx = ctxFalso();
  pxAnel(ctx, 0, 0, 40, PX, '#fff');
  const temCima = ctx.rects.some((r) => r.y < -30 && Math.abs(r.x) < PX * 2);
  const temBaixo = ctx.rects.some((r) => r.y > 30 && Math.abs(r.x) < PX * 2);
  const temEsq = ctx.rects.some((r) => r.x < -30 && Math.abs(r.y) < PX * 2);
  const temDir = ctx.rects.some((r) => r.x > 30 && Math.abs(r.y) < PX * 2);
  assert.ok(temCima && temBaixo && temEsq && temDir);
});

test('pxGrade desenha um bloco por pixel aceso', () => {
  const ctx = ctxFalso();
  pxGrade(ctx, [[0, 0], [1, 2]], 0, 0, '#fff');
  assert.deepEqual(
    ctx.rects.map((r) => [r.x, r.y]),
    [[0, 0], [2 * PX, PX]],
  );
});

test('pxTexto desenha os glifos e ignora caractere desconhecido', () => {
  const ctx = ctxFalso();
  pxTexto(ctx, '1', 0, 0, '#fff');
  // O "1" da fonte 3x5 tem 8 pixels acesos.
  assert.equal(ctx.rects.length, 8);
  assert.ok(todosNaGrade(ctx));

  const comLixo = ctxFalso();
  pxTexto(comLixo, '?', 0, 0, '#fff');
  assert.equal(comLixo.rects.length, 0);
});

test('pxLarguraTexto não conta o espaço depois do último caractere', () => {
  assert.equal(pxLarguraTexto('1'), 3 * PX);
  assert.equal(pxLarguraTexto('12'), 7 * PX);
  assert.equal(pxLarguraTexto('12', 2), 14 * PX);
});

test('pxTextoCentro centra o texto no ponto pedido', () => {
  const ctx = ctxFalso();
  pxTextoCentro(ctx, '11', 0, 0, '#fff');
  const xs = ctx.rects.map((r) => r.x);
  const ys = ctx.rects.map((r) => r.y);
  const meioX = (Math.min(...xs) + Math.max(...xs) + PX) / 2;
  const meioY = (Math.min(...ys) + Math.max(...ys) + PX) / 2;
  assert.ok(Math.abs(meioX) <= PX, `centro horizontal em ${meioX}`);
  assert.ok(Math.abs(meioY) <= PX, `centro vertical em ${meioY}`);
});

test('alphaEmDegraus só devolve os degraus, e nunca sai de [0, 1]', () => {
  assert.equal(alphaEmDegraus(0), 0);
  assert.equal(alphaEmDegraus(0.1), 0.25);
  assert.equal(alphaEmDegraus(0.5), 0.5);
  assert.equal(alphaEmDegraus(1), 1);
  assert.equal(alphaEmDegraus(-3), 0);
  assert.equal(alphaEmDegraus(9), 1);
  assert.equal(alphaEmDegraus(0.3, 2), 0.5);
});
