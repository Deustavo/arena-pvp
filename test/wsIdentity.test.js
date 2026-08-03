import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseConnectionParams, resolvePlayerIdentity, NICKNAME_PADRAO } from '../src/server/wsIdentity.js';

// getSession falso: devolve a sessão configurada sem tocar em banco.
function sessaoFake(sessao) {
  return async () => sessao;
}

describe('parseConnectionParams', () => {
  test('lê nickname, classId e token da query string', () => {
    const p = parseConnectionParams('/?nickname=Fulano&classId=mago&token=abc');
    assert.deepEqual(p, { nickname: 'Fulano', classId: 'mago', token: 'abc' });
  });

  test('usa o nickname padrão quando não vem nenhum', () => {
    assert.equal(parseConnectionParams('/').nickname, NICKNAME_PADRAO);
  });

  test('sanitiza o nickname (corta espaços e limita o tamanho)', () => {
    const p = parseConnectionParams(`/?nickname=${encodeURIComponent('   ' + 'a'.repeat(40))}`);
    assert.equal(p.nickname.length, 20);
  });

  // O token de sessão é base64 e costuma conter "+", "/" e "=". Em query
  // string um "+" cru vira espaço, o que corromperia o token — por isso o
  // cliente monta a URL com URLSearchParams. Este teste trava esse contrato.
  test('preserva token base64 com +, / e = quando codificado corretamente', () => {
    const token = 'abc123.2adc2HZBPg2yLqg/HayU0rCx+aNcmitck2uCnx0hSEk=';
    const query = new URLSearchParams({ token }).toString();
    assert.equal(parseConnectionParams(`/?${query}`).token, token);
  });
});

describe('resolvePlayerIdentity', () => {
  test('sem token, entra como convidado com o nickname da query string', async () => {
    const id = await resolvePlayerIdentity('/?nickname=Convidado', sessaoFake(null));
    assert.deepEqual(id, { nickname: 'Convidado', userId: null });
  });

  test('com sessão válida, usa o nome da conta e ignora o nickname enviado', async () => {
    const id = await resolvePlayerIdentity(
      '/?nickname=NomeFalso&token=t',
      sessaoFake({ user: { id: 'u1', name: 'NomeDaConta' } }),
    );
    assert.deepEqual(id, { nickname: 'NomeDaConta', userId: 'u1' });
  });

  test('token inválido (sessão nula) cai para convidado', async () => {
    const id = await resolvePlayerIdentity('/?nickname=Convidado&token=invalido', sessaoFake(null));
    assert.deepEqual(id, { nickname: 'Convidado', userId: null });
  });

  test('sessão sem id de usuário cai para convidado', async () => {
    const id = await resolvePlayerIdentity(
      '/?nickname=Convidado&token=t',
      sessaoFake({ user: { name: 'SemId' } }),
    );
    assert.deepEqual(id, { nickname: 'Convidado', userId: null });
  });

  test('erro ao consultar a sessão não derruba a conexão: entra como convidado', async () => {
    const id = await resolvePlayerIdentity('/?nickname=Convidado&token=t', async () => {
      throw new Error('banco fora do ar');
    });
    assert.deepEqual(id, { nickname: 'Convidado', userId: null });
  });

  test('o nome vindo da conta também é sanitizado', async () => {
    const id = await resolvePlayerIdentity(
      '/?token=t',
      sessaoFake({ user: { id: 'u1', name: `  ${'b'.repeat(40)}` } }),
    );
    assert.equal(id.nickname.length, 20);
    assert.equal(id.userId, 'u1');
  });
});
