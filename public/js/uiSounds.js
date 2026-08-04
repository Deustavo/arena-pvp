// Som de hover e clique dos botões. Tudo o que é clicável no jogo é um
// `<button>` (inclusive os cards de classe e os nomes do ranking), então um
// listener delegado no document cobre a interface inteira — sem precisar
// lembrar de plugar som em cada botão novo.

import { playHoverSound, playClickSound } from './audio.js';

// pointerover borbulha e dispara de novo a cada elemento filho por onde o mouse
// passa dentro do mesmo botão (ícone, texto). Guardar o último botão evita
// repetir o som sem sair dele.
let ultimoBotao = null;

function botaoDoEvento(alvo) {
  const botao = alvo instanceof Element ? alvo.closest('button') : null;
  if (!botao || botao.disabled) return null;
  return botao;
}

export function initUiSounds() {
  document.addEventListener('pointerover', (e) => {
    const botao = botaoDoEvento(e.target);
    if (botao === ultimoBotao) return;
    ultimoBotao = botao;
    if (botao) playHoverSound();
  });

  document.addEventListener('click', (e) => {
    if (botaoDoEvento(e.target)) playClickSound();
  });
}
