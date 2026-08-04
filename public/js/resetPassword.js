// Página aberta pelo link de "esqueci minha senha" do e-mail. O Better Auth
// redireciona para cá com o token na query string.

import { resetPassword } from './auth.js';
import { initPasswordToggles } from './passwordToggle.js';
import { playFormErrorSound, playFormSuccessSound } from './audio.js';

initPasswordToggles();

const form = document.getElementById('resetForm');
const senhaInput = document.getElementById('resetPassword');
const confirmaInput = document.getElementById('resetPasswordConfirm');
const feedbackEl = document.getElementById('resetFeedback');
const btnSubmit = document.getElementById('btnResetSubmit');

const params = new URLSearchParams(location.search);
const token = params.get('token');
// O Better Auth manda ?error=INVALID_TOKEN quando o link já era inválido.
const erroNoLink = params.get('error');

function mostrarFeedback(texto, tipo) {
  feedbackEl.textContent = texto;
  feedbackEl.className = texto ? `visible ${tipo}` : '';
  if (!texto) return;
  if (tipo === 'erro') playFormErrorSound();
  else if (tipo === 'sucesso') playFormSuccessSound();
}

function desabilitarFormulario() {
  senhaInput.disabled = true;
  confirmaInput.disabled = true;
  btnSubmit.disabled = true;
}

if (!token || erroNoLink) {
  mostrarFeedback(
    'Esse link é inválido ou já expirou. Volte ao jogo e peça um novo em '
    + '"Esqueci minha senha".',
    'erro',
  );
  desabilitarFormulario();
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (btnSubmit.disabled) return;

  if (senhaInput.value.length < 8) {
    mostrarFeedback('A senha precisa ter pelo menos 8 caracteres.', 'erro');
    return;
  }
  if (senhaInput.value !== confirmaInput.value) {
    mostrarFeedback('As duas senhas não são iguais.', 'erro');
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Salvando...';
  try {
    await resetPassword({ token, newPassword: senhaInput.value });
    mostrarFeedback('Senha alterada! Já pode entrar com ela no jogo.', 'sucesso');
    desabilitarFormulario();
  } catch (erro) {
    mostrarFeedback(erro.message, 'erro');
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Salvar nova senha';
  }
});
