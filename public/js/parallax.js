// Efeito de paralaxe do fundo do menu: a textura de tijolos se desloca um
// pouco na direção do mouse. Some durante a partida porque
// `body.game-active` some do CSS (ver `body:not(.game-active)` em
// style.css), então nem precisa ler o estado do jogo aqui — basta não
// atualizar as variáveis CSS.
const AMPLITUDE_PX = 40;

export function initParallax() {
  // O `mousemove` pode disparar dezenas de vezes por frame; escrever a
  // variável CSS a cada evento (com a transição do body） empilha repaints
  // mais rápido do que o navegador consegue desenhar, e o fundo só "alcança"
  // o mouse segundos depois. Guarda só a posição mais recente e aplica no
  // máximo uma vez por frame com requestAnimationFrame.
  let pendente = null;
  let agendado = false;

  const aplicar = () => {
    agendado = false;
    if (!pendente) return;
    const { x, y } = pendente;
    document.body.style.setProperty('--parallax-x', `${x.toFixed(2)}px`);
    document.body.style.setProperty('--parallax-y', `${y.toFixed(2)}px`);
  };

  window.addEventListener('mousemove', (evento) => {
    if (document.body.classList.contains('game-active')) return;
    const proporcaoX = evento.clientX / window.innerWidth - 0.5;
    const proporcaoY = evento.clientY / window.innerHeight - 0.5;
    pendente = { x: -proporcaoX * AMPLITUDE_PX, y: -proporcaoY * AMPLITUDE_PX };
    if (!agendado) {
      agendado = true;
      requestAnimationFrame(aplicar);
    }
  });
}
