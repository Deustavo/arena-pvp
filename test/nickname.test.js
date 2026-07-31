import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeNickname, isValidNickname, NICKNAME_MAX_LENGTH } from '../shared/nickname.js';

describe('sanitizeNickname', () => {
  test('remove espaços nas bordas', () => {
    assert.equal(sanitizeNickname('  Fulano  '), 'Fulano');
  });

  test('trunca no tamanho máximo permitido', () => {
    const long = 'a'.repeat(NICKNAME_MAX_LENGTH + 10);
    assert.equal(sanitizeNickname(long), 'a'.repeat(NICKNAME_MAX_LENGTH));
  });

  test('retorna string vazia para valores não-string', () => {
    assert.equal(sanitizeNickname(null), '');
    assert.equal(sanitizeNickname(undefined), '');
    assert.equal(sanitizeNickname(42), '');
  });

  test('retorna string vazia para espaços em branco', () => {
    assert.equal(sanitizeNickname('   '), '');
  });
});

describe('isValidNickname', () => {
  test('nickname não vazio após sanitização é válido', () => {
    assert.equal(isValidNickname('Fulano'), true);
  });

  test('nickname vazio ou só espaços é inválido', () => {
    assert.equal(isValidNickname(''), false);
    assert.equal(isValidNickname('   '), false);
    assert.equal(isValidNickname(undefined), false);
  });
});
