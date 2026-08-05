// Efeito de paralaxe do fundo do menu: a textura de tijolos se desloca um
// pouco na direção do mouse. Some durante a partida porque
// `body.game-active` some do CSS (ver `body:not(.game-active)` em
// style.css), então nem precisa ler o estado do jogo aqui — basta não
// atualizar as variáveis CSS.
const AMPLITUDE_PX = 18;

export function initParallax() {
  window.addEventListener('mousemove', (evento) => {
    if (document.body.classList.contains('game-active')) return;
    const proporcaoX = evento.clientX / window.innerWidth - 0.5;
    const proporcaoY = evento.clientY / window.innerHeight - 0.5;
    document.body.style.setProperty('--parallax-x', `${(-proporcaoX * AMPLITUDE_PX).toFixed(2)}px`);
    document.body.style.setProperty('--parallax-y', `${(-proporcaoY * AMPLITUDE_PX).toFixed(2)}px`);
  });
}
