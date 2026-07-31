import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, rectsIntersect, circleHitsProjectile, movementDelta } from '../shared/physics.js';

describe('clamp', () => {
  test('retorna o valor quando dentro dos limites', () => {
    assert.equal(clamp(5, 0, 10), 5);
  });

  test('limita ao mínimo quando abaixo', () => {
    assert.equal(clamp(-5, 0, 10), 0);
  });

  test('limita ao máximo quando acima', () => {
    assert.equal(clamp(15, 0, 10), 10);
  });

  test('aceita valores exatamente nos limites', () => {
    assert.equal(clamp(0, 0, 10), 0);
    assert.equal(clamp(10, 0, 10), 10);
  });
});

describe('rectsIntersect', () => {
  test('detecta sobreposição', () => {
    assert.equal(rectsIntersect(0, 0, 10, 10, 5, 5, 10, 10), true);
  });

  test('detecta ausência de sobreposição', () => {
    assert.equal(rectsIntersect(0, 0, 10, 10, 20, 20, 10, 10), false);
  });

  test('retângulos apenas encostando nas bordas não se intersectam (exclusivo)', () => {
    assert.equal(rectsIntersect(0, 0, 10, 10, 10, 0, 10, 10), false);
  });

  test('um retângulo contido no outro intersecta', () => {
    assert.equal(rectsIntersect(0, 0, 20, 20, 5, 5, 2, 2), true);
  });
});

describe('circleHitsProjectile', () => {
  const playerSize = 30;
  const shieldRadius = 34;
  const projectileSize = 8;

  test('detecta acerto quando projétil está dentro do raio do escudo', () => {
    const player = { x: 100, y: 100 };
    const proj = { x: 115, y: 115 }; // centro do player é (115,115)
    assert.equal(circleHitsProjectile(player, proj, playerSize, shieldRadius, projectileSize), true);
  });

  test('detecta ausência de acerto quando projétil está fora do raio', () => {
    const player = { x: 100, y: 100 };
    const proj = { x: 300, y: 300 };
    assert.equal(circleHitsProjectile(player, proj, playerSize, shieldRadius, projectileSize), false);
  });

  test('considera acerto exatamente na borda do raio (inclusivo)', () => {
    const player = { x: 0, y: 0 };
    const cx = playerSize / 2;
    const cy = playerSize / 2;
    const edgeDistance = shieldRadius + projectileSize / 2;
    const proj = { x: cx + edgeDistance, y: cy };
    assert.equal(circleHitsProjectile(player, proj, playerSize, shieldRadius, projectileSize), true);
  });
});

describe('movementDelta', () => {
  test('sem input retorna delta zero', () => {
    assert.deepEqual(movementDelta({ up: false, down: false, left: false, right: false }), { dx: 0, dy: 0 });
  });

  test('movimento ortogonal não é normalizado', () => {
    assert.deepEqual(movementDelta({ up: true, down: false, left: false, right: false }), { dx: 0, dy: -1 });
    assert.deepEqual(movementDelta({ up: false, down: true, left: false, right: false }), { dx: 0, dy: 1 });
    assert.deepEqual(movementDelta({ up: false, down: false, left: true, right: false }), { dx: -1, dy: 0 });
    assert.deepEqual(movementDelta({ up: false, down: false, left: false, right: true }), { dx: 1, dy: 0 });
  });

  test('movimento diagonal é normalizado (não é mais rápido que ortogonal)', () => {
    const { dx, dy } = movementDelta({ up: true, down: false, left: true, right: false });
    assert.ok(Math.abs(dx - -Math.SQRT1_2) < 1e-9);
    assert.ok(Math.abs(dy - -Math.SQRT1_2) < 1e-9);
    const magnitude = Math.hypot(dx, dy);
    assert.ok(Math.abs(magnitude - 1) < 1e-9);
  });

  test('inputs opostos se cancelam', () => {
    assert.deepEqual(
      movementDelta({ up: true, down: true, left: true, right: true }),
      { dx: 0, dy: 0 }
    );
  });
});
