import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeNickname, isValidNickname, isValidAccountName, filterAccountNameChars,
  NICKNAME_MAX_LENGTH,
} from '../shared/nickname.js';

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

describe('isValidAccountName', () => {
  test('aceita letras e números', () => {
    assert.equal(isValidAccountName('Fulano'), true);
    assert.equal(isValidAccountName('Fulano123'), true);
    assert.equal(isValidAccountName('123'), true);
  });

  test('rejeita espaço, inclusive no meio', () => {
    assert.equal(isValidAccountName('Fulano Silva'), false);
    assert.equal(isValidAccountName('Fulano\tSilva'), false);
    assert.equal(isValidAccountName(''), false);
    assert.equal(isValidAccountName('   '), false);
  });

  test('aceita nome com espaço nas bordas (sanitizado antes)', () => {
    assert.equal(isValidAccountName('  Fulano  '), true);
  });

  test('rejeita acento, pontuação, símbolo e emoji', () => {
    assert.equal(isValidAccountName('Zé'), false);
    assert.equal(isValidAccountName('Fulano_123'), false);
    assert.equal(isValidAccountName('Fulano-123'), false);
    assert.equal(isValidAccountName('<script>'), false);
    assert.equal(isValidAccountName('Fulano😎'), false);
  });

  test('rejeita valores não-string', () => {
    assert.equal(isValidAccountName(null), false);
    assert.equal(isValidAccountName(42), false);
  });
});

describe('filterAccountNameChars', () => {
  test('mantém letras e números intactos', () => {
    assert.equal(filterAccountNameChars('Fulano123'), 'Fulano123');
  });

  test('remove espaço, acento, pontuação e emoji', () => {
    assert.equal(filterAccountNameChars('Fulano Silva'), 'FulanoSilva');
    assert.equal(filterAccountNameChars('Zé_Ninja!'), 'ZNinja');
    assert.equal(filterAccountNameChars('<script>'), 'script');
    assert.equal(filterAccountNameChars('Fulano😎'), 'Fulano');
  });

  test('retorna string vazia para valores não-string ou sem caractere válido', () => {
    assert.equal(filterAccountNameChars(null), '');
    assert.equal(filterAccountNameChars(42), '');
    assert.equal(filterAccountNameChars('!!!'), '');
  });

  test('o que sobra da filtragem é sempre um nome válido (quando não vazio)', () => {
    const filtrado = filterAccountNameChars('  Zé da Silva #1  ');
    assert.equal(filtrado, 'ZdaSilva1');
    assert.equal(isValidAccountName(filtrado), true);
  });
});
