import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_DIFFICULTIES, DEFAULT_BOT_DIFFICULTY, getBotDifficulty } from '../shared/botDifficulty.js';

describe('getBotDifficulty', () => {
  test('retorna o perfil correspondente a um id válido', () => {
    assert.equal(getBotDifficulty('noob'), BOT_DIFFICULTIES.noob);
    assert.equal(getBotDifficulty('intermediario'), BOT_DIFFICULTIES.intermediario);
    assert.equal(getBotDifficulty('demoniaco'), BOT_DIFFICULTIES.demoniaco);
  });

  test('retorna a dificuldade padrão para um id inválido', () => {
    assert.equal(getBotDifficulty('inexistente'), BOT_DIFFICULTIES[DEFAULT_BOT_DIFFICULTY]);
  });

  test('retorna a dificuldade padrão quando nenhum id é informado', () => {
    assert.equal(getBotDifficulty(undefined), BOT_DIFFICULTIES[DEFAULT_BOT_DIFFICULTY]);
    assert.equal(getBotDifficulty(null), BOT_DIFFICULTIES[DEFAULT_BOT_DIFFICULTY]);
  });

  test('DEFAULT_BOT_DIFFICULTY aponta para um perfil existente', () => {
    assert.ok(BOT_DIFFICULTIES[DEFAULT_BOT_DIFFICULTY]);
  });

  test('o perfil demoníaco é estritamente o mais forte (menores margens de erro)', () => {
    const { noob, intermediario, demoniaco } = BOT_DIFFICULTIES;
    assert.ok(demoniaco.aimSpread <= intermediario.aimSpread && intermediario.aimSpread <= noob.aimSpread);
    assert.ok(demoniaco.reactionDelayMs <= intermediario.reactionDelayMs && intermediario.reactionDelayMs <= noob.reactionDelayMs);
    assert.ok(demoniaco.dodgeChance >= intermediario.dodgeChance && intermediario.dodgeChance >= noob.dodgeChance);
    assert.ok(demoniaco.shieldChance >= intermediario.shieldChance && intermediario.shieldChance >= noob.shieldChance);
  });

  test('cada perfil define os campos essenciais usados pela IA do bot', () => {
    for (const [id, diff] of Object.entries(BOT_DIFFICULTIES)) {
      assert.equal(diff.id, id);
      assert.equal(typeof diff.name, 'string');
      assert.ok(diff.aimSpread >= 0);
      assert.ok(diff.cooldownExtraMs >= 0);
      assert.ok(diff.shotJitterMs >= 0);
      assert.ok(diff.dodgeChance >= 0 && diff.dodgeChance <= 1);
      assert.ok(diff.shieldChance >= 0 && diff.shieldChance <= 1);
      assert.ok(diff.trackingErrorPx >= 0);
      assert.ok(diff.reactionDelayMs >= 0);
      assert.equal(typeof diff.predictive, 'boolean');
    }
  });
});
