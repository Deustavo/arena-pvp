// Telas de conta (entrar / criar conta / esqueci a senha) e o estado
// logado/convidado do menu. Um modal só, trocando de "view" — o fluxo é curto
// e não justifica telas separadas.

import {
  authOverlayEl, authTitleEl, authFormEl, authFeedbackEl,
  authFieldNameEl, authFieldEmailEl, authFieldPasswordEl, authTurnstileEl,
  authNameInput, authEmailInput, authPasswordInput,
  authLinksEl, btnAuthSubmit, btnAuthClose, btnAuthForgot, btnAuthSwitch,
  accountBarEl, accountLoggedInEl, accountLoggedOutEl, accountNameEl,
  nicknameFieldEl, btnLogin, btnSignup, btnLogout,
} from './dom.js';
import { state } from './state.js';
import * as auth from './auth.js';
import { TURNSTILE_SITE_KEY } from './config.js';
import { isValidAccountName, filterAccountNameChars, ACCOUNT_NAME_ERROR } from '../../shared/nickname.js';
import { initPasswordToggles } from './passwordToggle.js';

// 'login' | 'signup' | 'forgot'
let view = 'login';
let enviando = false;

// O widget do Turnstile é renderizado uma única vez (as três views usam o
// mesmo captcha) e resetado a cada tentativa de envio, já que o token só
// serve para uma requisição. `window.turnstile` só existe depois do script
// externo carregar — sem ele o captcha fica desativado e o servidor decide
// se exige ou não o header (não exige sem TURNSTILE_SECRET_KEY configurada).
let turnstileWidgetId = null;
let turnstileToken = null;

function renderTurnstileSeNecessario() {
  if (turnstileWidgetId !== null || typeof window.turnstile === 'undefined') return;
  turnstileWidgetId = window.turnstile.render(authTurnstileEl, {
    sitekey: TURNSTILE_SITE_KEY,
    callback: (token) => { turnstileToken = token; },
    'expired-callback': () => { turnstileToken = null; },
    'error-callback': () => { turnstileToken = null; },
  });
}

function resetTurnstile() {
  turnstileToken = null;
  if (turnstileWidgetId !== null) window.turnstile?.reset(turnstileWidgetId);
}

const VIEWS = {
  login: {
    titulo: 'Entrar',
    botao: 'Entrar',
    campos: { nome: false, email: true, senha: true },
    trocarPara: 'signup',
    textoTrocar: 'Criar conta',
    mostrarEsqueci: true,
  },
  signup: {
    titulo: 'Criar conta',
    botao: 'Criar conta',
    campos: { nome: true, email: true, senha: true },
    trocarPara: 'login',
    textoTrocar: 'Já tenho conta',
    mostrarEsqueci: false,
  },
  forgot: {
    titulo: 'Esqueci minha senha',
    botao: 'Enviar link',
    campos: { nome: false, email: true, senha: false },
    trocarPara: 'login',
    textoTrocar: 'Voltar para entrar',
    mostrarEsqueci: false,
  },
};

function mostrarFeedback(texto, tipo) {
  authFeedbackEl.textContent = texto;
  authFeedbackEl.className = texto ? `visible ${tipo}` : '';
}

// Depois de cadastrar ou pedir o link de nova senha não há mais o que
// preencher: o modal fica só com o aviso, e o jogador fecha quando terminar
// de ler (o e-mail pode demorar a chegar).
function mostrarApenasAviso(texto) {
  mostrarFeedback(texto, 'sucesso');
  authFormEl.style.display = 'none';
  authLinksEl.style.display = 'none';
}

function renderView() {
  const v = VIEWS[view];
  authFormEl.style.display = 'flex';
  authLinksEl.style.display = 'flex';
  authTitleEl.textContent = v.titulo;
  btnAuthSubmit.textContent = v.botao;
  authFieldNameEl.style.display = v.campos.nome ? 'flex' : 'none';
  authFieldEmailEl.style.display = v.campos.email ? 'flex' : 'none';
  authFieldPasswordEl.style.display = v.campos.senha ? 'flex' : 'none';
  authPasswordInput.autocomplete = view === 'signup' ? 'new-password' : 'current-password';
  btnAuthForgot.style.display = v.mostrarEsqueci ? 'inline' : 'none';
  btnAuthSwitch.textContent = v.textoTrocar;
  mostrarFeedback('', '');
}

function abrir(novaView) {
  view = novaView;
  renderView();
  authOverlayEl.classList.add('visible');
  renderTurnstileSeNecessario();
  const primeiro = view === 'signup' ? authNameInput : authEmailInput;
  primeiro.focus();
}

function fechar() {
  authOverlayEl.classList.remove('visible');
  authFormEl.reset();
  mostrarFeedback('', '');
}

// Descarta caractere proibido na hora em que ele é digitado (ou colado), em
// vez de só reclamar no envio. Cobre paste e arrastar texto porque o evento
// `input` dispara em todos esses casos.
function filtrarNomeDigitado() {
  const digitado = authNameInput.value;
  const limpo = filterAccountNameChars(digitado);
  if (limpo === digitado) return;

  // Sem isto o cursor pularia para o fim do campo a cada caractere descartado,
  // o que atrapalha quem está corrigindo o meio do nome.
  const cursor = authNameInput.selectionStart ?? digitado.length;
  const removidosAntesDoCursor = cursor - filterAccountNameChars(digitado.slice(0, cursor)).length;

  authNameInput.value = limpo;
  const novaPosicao = cursor - removidosAntesDoCursor;
  authNameInput.setSelectionRange(novaPosicao, novaPosicao);

  // O caractere simplesmente desaparecer sem explicação parece bug; o aviso
  // diz por que ele não entrou.
  mostrarFeedback(ACCOUNT_NAME_ERROR, 'erro');
}

function setEnviando(valor) {
  enviando = valor;
  btnAuthSubmit.disabled = valor;
  btnAuthSubmit.textContent = valor ? 'Aguarde...' : VIEWS[view].botao;
}

async function submeter(evento) {
  evento.preventDefault();
  if (enviando) return;

  const nome = authNameInput.value.trim();
  const email = authEmailInput.value.trim();
  const senha = authPasswordInput.value;

  if (VIEWS[view].campos.email && !email) {
    mostrarFeedback('Informe seu e-mail.', 'erro');
    return;
  }
  if (view === 'signup' && !nome) {
    mostrarFeedback('Escolha um nome de jogador.', 'erro');
    authNameInput.focus();
    return;
  }
  // Mesma regra do servidor (shared/nickname.js): sem espaço nem caractere
  // especial. Barra o envio antes de gastar uma tentativa de cadastro (e o
  // token do captcha, que só vale para uma requisição).
  if (view === 'signup' && !isValidAccountName(nome)) {
    mostrarFeedback(ACCOUNT_NAME_ERROR, 'erro');
    authNameInput.focus();
    return;
  }
  if (VIEWS[view].campos.senha && senha.length < 8) {
    mostrarFeedback('A senha precisa ter pelo menos 8 caracteres.', 'erro');
    return;
  }

  const captchaToken = turnstileToken;
  setEnviando(true);
  try {
    if (view === 'login') {
      await auth.signIn({ email, password: senha, captchaToken });
      atualizarBarraDeConta();
      fechar();
      return;
    }
    if (view === 'signup') {
      await auth.signUp({ name: nome, email, password: senha, captchaToken });
      authFormEl.reset();
      // O Better Auth responde 200 mesmo quando o e-mail já tem conta (é uma
      // proteção contra enumeração de e-mail: assim ninguém descobre por
      // tentativa quais e-mails já estão cadastrados). Por isso a mensagem
      // não pode afirmar "conta criada" — quem já tem conta não recebe e-mail
      // nenhum e precisa ser avisado a tentar entrar ou recuperar a senha.
      mostrarApenasAviso(
        `Se ${email} ainda não tem conta, acabamos de enviar um link de confirmação `
        + '(olhe também a caixa de spam). Se você já tem conta com esse e-mail, '
        + 'tente entrar ou usar "Esqueci minha senha".',
      );
      return;
    }
    await auth.requestPasswordReset(email, captchaToken);
    authFormEl.reset();
    mostrarApenasAviso(
      'Se existir uma conta com esse e-mail, o link para criar uma nova senha '
      + 'acabou de ser enviado (olhe também a caixa de spam).',
    );
  } catch (erro) {
    mostrarFeedback(erro.message, 'erro');
  } finally {
    resetTurnstile();
    setEnviando(false);
  }
}

// Alterna o menu entre "logado" (nome da conta, sem campo de nickname) e
// "convidado" (campo de nickname visível).
export function atualizarBarraDeConta() {
  const logado = state.user !== null;
  accountBarEl.classList.remove('skeleton-loading');
  accountLoggedInEl.style.display = logado ? 'flex' : 'none';
  accountLoggedOutEl.style.display = logado ? 'none' : 'flex';
  nicknameFieldEl.style.display = logado ? 'none' : 'flex';
  if (logado) {
    accountNameEl.textContent = state.user.name;
    // Com conta, o nome do jogador é o da conta — o servidor reforça isso no
    // handshake, aqui é só para a UI e o modo treino ficarem coerentes.
    state.nickname = state.user.name;
  }
}

export function initAuthScreens() {
  initPasswordToggles(authOverlayEl);
  authFormEl.addEventListener('submit', submeter);
  authNameInput.addEventListener('input', filtrarNomeDigitado);
  btnAuthClose.addEventListener('click', fechar);
  btnAuthForgot.addEventListener('click', () => abrir('forgot'));
  btnAuthSwitch.addEventListener('click', () => abrir(VIEWS[view].trocarPara));
  btnLogin.addEventListener('click', () => abrir('login'));
  btnSignup.addEventListener('click', () => abrir('signup'));
  btnLogout.addEventListener('click', async () => {
    await auth.signOut();
    state.nickname = '';
    atualizarBarraDeConta();
  });

  authOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === authOverlayEl) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && authOverlayEl.classList.contains('visible')) fechar();
  });

  // Não chama atualizarBarraDeConta() aqui: o #accountBar fica com o
  // skeleton (ver index.html) até loadSession() resolver em main.js. Chamar
  // aqui já assumiria "convidado" e tiraria o skeleton cedo demais, causando
  // um flash da barra de convidado para quem tem sessão salva.
}
