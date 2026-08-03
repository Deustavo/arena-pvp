// Quem é o jogador do outro lado do socket. Duas possibilidades:
//
// - Conta logada: o nome vem da conta, e o nickname mandado na query string é
//   ignorado. Sem isso qualquer um poderia se passar por um jogador registrado
//   simplesmente digitando o nome dele no menu.
// - Convidado: nickname da query string, como sempre foi.
//
// A sessão chega por bearer token na query string (e não por cookie) porque o
// front e o backend ficam em domínios diferentes, e porque o browser não
// permite headers customizados em `new WebSocket`.

import { sanitizeNickname } from '../../shared/nickname.js';

export const NICKNAME_PADRAO = 'Jogador';

export function parseConnectionParams(url) {
  const { searchParams } = new URL(url, 'http://localhost');
  return {
    nickname: sanitizeNickname(searchParams.get('nickname')) || NICKNAME_PADRAO,
    classId: searchParams.get('classId'),
    token: searchParams.get('token'),
  };
}

// `getSession` recebe o token e devolve a sessão (ou null). Injetado para
// manter esta função testável sem banco.
export async function resolvePlayerIdentity(url, getSession) {
  const { nickname, token } = parseConnectionParams(url);
  const convidado = { nickname, userId: null };

  if (!token) return convidado;

  let sessao;
  try {
    sessao = await getSession(token);
  } catch (erro) {
    // Banco fora do ar não pode impedir ninguém de jogar: cai para convidado.
    console.error('[ws] falha ao validar sessão, entrando como convidado:', erro.message);
    return convidado;
  }

  const nomeDaConta = sanitizeNickname(sessao?.user?.name);
  if (!sessao?.user?.id || !nomeDaConta) return convidado;

  return { nickname: nomeDaConta, userId: sessao.user.id };
}
