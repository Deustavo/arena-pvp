// Liga o botão de "mostrar/ocultar senha" em todo input dentro de um
// wrapper `.password-field-wrap` que tenha um `.password-toggle-btn` irmão.
export function initPasswordToggles(root = document) {
  root.querySelectorAll('.password-toggle-btn').forEach((botao) => {
    const input = botao.previousElementSibling;
    if (!input || input.tagName !== 'INPUT') return;
    botao.addEventListener('click', () => {
      const mostrando = input.type === 'text';
      input.type = mostrando ? 'password' : 'text';
      botao.textContent = mostrando ? '👁' : '🙈';
      botao.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha');
    });
  });
}
