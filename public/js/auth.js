// Cliente de autenticação. O projeto não tem bundler, então não dá para usar o
// SDK do Better Auth — mas os endpoints dele são REST simples, então falamos
// direto por fetch.
//
// A sessão usa bearer token (e não cookie) porque front e backend ficam em
// domínios diferentes em produção: um cookie de sessão ali seria cookie de
// terceiros e é bloqueado por padrão em vários navegadores.

import { BACKEND_URL } from './config.js';
import { state } from './state.js';

const TOKEN_KEY = 'jogoDoAno.authToken';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return state.user !== null;
}

// Erro com a mensagem já pronta para exibir ao jogador.
class AuthError extends Error {}

async function apiAuth(path, { method = 'POST', body } = {}) {
  const token = getToken();
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/auth/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AuthError('Não foi possível falar com o servidor. Tente de novo.');
  }

  // O plugin bearer devolve o token da sessão neste header ao entrar/cadastrar.
  const novoToken = res.headers.get('set-auth-token');
  if (novoToken) setToken(novoToken);

  const texto = await res.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!res.ok) {
    throw new AuthError(traduzErro(dados, res.status));
  }
  return dados;
}

// O Better Auth responde em inglês; traduzimos os casos que o jogador pode ver.
const ERROS = {
  INVALID_EMAIL_OR_PASSWORD: 'E-mail ou senha incorretos.',
  EMAIL_NOT_VERIFIED: 'Confirme seu e-mail antes de entrar. Reenviamos o link para você.',
  USER_ALREADY_EXISTS: 'Já existe uma conta com esse e-mail.',
  PASSWORD_TOO_SHORT: 'A senha precisa ter pelo menos 8 caracteres.',
  INVALID_TOKEN: 'Esse link é inválido ou já foi usado. Peça um novo.',
  TOKEN_EXPIRED: 'Esse link expirou. Peça um novo.',
};

function traduzErro(dados, status) {
  if (dados?.code && ERROS[dados.code]) return ERROS[dados.code];
  // Mensagens dos nossos próprios hooks (nome em uso, etc.) já vêm em português.
  if (dados?.message && !/^[A-Z_]+$/.test(dados.message)) return dados.message;
  if (status === 429) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  return 'Algo deu errado. Tente de novo.';
}

export async function signUp({ name, email, password }) {
  await apiAuth('sign-up/email', {
    body: { name, email, password, callbackURL: `${location.origin}/` },
  });
  // Com verificação de e-mail obrigatória, o cadastro não loga direto:
  // o jogador precisa confirmar o e-mail primeiro.
}

export async function signIn({ email, password }) {
  const dados = await apiAuth('sign-in/email', { body: { email, password } });
  state.user = dados.user;
  return dados.user;
}

export async function signOut() {
  try {
    await apiAuth('sign-out', { body: {} });
  } catch {
    // Mesmo se a chamada falhar, limpamos o token local — o jogador pediu sair.
  }
  setToken(null);
  state.user = null;
}

export async function requestPasswordReset(email) {
  await apiAuth('request-password-reset', {
    body: { email, redirectTo: `${location.origin}/reset-password.html` },
  });
}

export async function resetPassword({ token, newPassword }) {
  await apiAuth('reset-password', { body: { token, newPassword } });
}

export async function resendVerification(email) {
  await apiAuth('send-verification-email', {
    body: { email, callbackURL: `${location.origin}/` },
  });
}

// Carrega a sessão a partir do token guardado. Chamado uma vez ao abrir o jogo.
export async function loadSession() {
  if (!getToken()) {
    state.user = null;
    return null;
  }
  try {
    const dados = await apiAuth('get-session', { method: 'GET' });
    state.user = dados?.user ?? null;
    if (!state.user) setToken(null); // token expirado ou revogado
  } catch {
    state.user = null;
  }
  return state.user;
}
