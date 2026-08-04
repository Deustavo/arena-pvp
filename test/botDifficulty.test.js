import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_DIFFICULTIES, DEFAULT_BOT_DIFFICULTY, getBotDifficulty } from '../shared/botDifficulty.js';

describe('getBotDifficulty', () => {
  test('retorna o perfil correspondente a um id válido', () => {
    assert.equal(getBotDifficulty('noob'), BOT_DIFFICULTIES.noob);
    assert.equal(getBotDifficulty('intermediario'), BOT_DIFFICULTIES.intermediario);
    assert.equal(getBotDifficulty('dificil'), BOT_DIFFICULTIES.dificil);
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

  test('cada dificuldade é estritamente mais forte que a anterior (menores margens de erro)', () => {
    const {
      noob, intermediario, dificil, demoniaco,
    } = BOT_DIFFICULTIES;
    const ordem = [noob, intermediario, dificil, demoniaco];
    for (let i = 1; i < ordem.length; i++) {
      assert.ok(ordem[i].aimSpread <= ordem[i - 1].aimSpread);
      assert.ok(ordem[i].reactionDelayMs <= ordem[i - 1].reactionDelayMs);
      assert.ok(ordem[i].dodgeChance >= ordem[i - 1].dodgeChance);
      assert.ok(ordem[i].shieldChance >= ordem[i - 1].shieldChance);
    }
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
