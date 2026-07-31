import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, DEFAULT_CLASS_ID, getClass } from '../shared/classes.js';

describe('getClass', () => {
  test('retorna a classe correspondente a um id válido', () => {
    assert.equal(getClass('mago'), CLASSES.mago);
    assert.equal(getClass('tank'), CLASSES.tank);
    assert.equal(getClass('atirador'), CLASSES.atirador);
  });

  test('retorna a classe padrão para um id inválido', () => {
    assert.equal(getClass('inexistente'), CLASSES[DEFAULT_CLASS_ID]);
  });

  test('retorna a classe padrão quando nenhum id é informado', () => {
    assert.equal(getClass(undefined), CLASSES[DEFAULT_CLASS_ID]);
    assert.equal(getClass(null), CLASSES[DEFAULT_CLASS_ID]);
  });

  test('DEFAULT_CLASS_ID aponta para uma classe existente', () => {
    assert.ok(CLASSES[DEFAULT_CLASS_ID]);
  });

  test('cada classe define os campos essenciais usados pela simulação', () => {
    for (const [id, cls] of Object.entries(CLASSES)) {
      assert.equal(cls.id, id);
      assert.equal(typeof cls.name, 'string');
      assert.ok(cls.shotCooldownMs > 0);
      assert.ok(cls.damage > 0);
      assert.ok(cls.shieldMaxHits > 0);
      assert.ok(cls.maxLives > 0);
      assert.ok(cls.speed > 0);
      assert.ok(cls.projectileCount > 0);
      assert.ok(cls.projectileSize > 0);
      assert.ok(cls.range > 0);
      assert.ok(Array.isArray(cls.traits));
    }
  });
});
