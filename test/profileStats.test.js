import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { topClassesUsadas, PARTIDAS_CONSIDERADAS } from '../public/js/profileStats.js';

function partidas(...classes) {
  return classes.map((playerClass) => ({ playerClass }));
}

describe('topClassesUsadas', () => {
  test('conta as partidas por classe e ordena da mais usada para a menos', () => {
    const resultado = topClassesUsadas(partidas('mago', 'tank', 'mago', 'atirador', 'mago', 'tank'));
    assert.deepEqual(resultado, [
      { classId: 'mago', total: 3 },
      { classId: 'tank', total: 2 },
      { classId: 'atirador', total: 1 },
    ]);
  });

  test('devolve no máximo 3 classes', () => {
    const resultado = topClassesUsadas(partidas('mago', 'tank', 'atirador', 'assassino'));
    assert.equal(resultado.length, 3);
  });

  test('em caso de empate, a classe usada mais recentemente vem primeiro', () => {
    // A lista chega da API da mais recente para a mais antiga.
    const resultado = topClassesUsadas(partidas('tank', 'mago'));
    assert.deepEqual(resultado, [
      { classId: 'tank', total: 1 },
      { classId: 'mago', total: 1 },
    ]);
  });

  test(`considera só as últimas ${PARTIDAS_CONSIDERADAS} partidas`, () => {
    const recentes = Array(PARTIDAS_CONSIDERADAS).fill('mago');
    const antigas = Array(10).fill('tank');
    const resultado = topClassesUsadas(partidas(...recentes, ...antigas));
    assert.deepEqual(resultado, [{ classId: 'mago', total: PARTIDAS_CONSIDERADAS }]);
  });

  test('ignora partidas sem classe registrada', () => {
    const resultado = topClassesUsadas([{ playerClass: 'mago' }, {}, { playerClass: null }]);
    assert.deepEqual(resultado, [{ classId: 'mago', total: 1 }]);
  });

  test('devolve lista vazia sem histórico', () => {
    assert.deepEqual(topClassesUsadas([]), []);
    assert.deepEqual(topClassesUsadas(undefined), []);
  });
});
