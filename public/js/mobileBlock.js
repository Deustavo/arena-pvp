// Bloqueio de celular/tablet. O jogo é de teclado + mouse (WASD para andar,
// mouse para mirar e clicar para atirar) e não tem controle de toque, então
// num aparelho sem os dois não existe partida possível — em vez de deixar o
// jogador entrar num menu que não leva a lugar nenhum, mostramos um aviso e
// paramos antes de qualquer inicialização (inclusive a da música, que ficaria
// tocando por cima da mensagem).

const UA_MOBILE = /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini|BlackBerry|Mobile/i;

// Pura (sem DOM nem navigator), para ser testável — ver test/mobileBlock.test.js.
export function deveBloquearMobile({
  userAgent = '',
  uaDataMobile = null,
  platform = '',
  maxTouchPoints = 0,
  pointerCoarse = false,
  hoverDisponivel = true,
} = {}) {
  // User-Agent Client Hints, quando existe, é a resposta direta do navegador.
  if (uaDataMobile === true) return true;
  if (UA_MOBILE.test(userAgent)) return true;
  // iPadOS 13+ se anuncia como Mac desktop; o que o entrega é o multitoque.
  if (/Mac/i.test(platform) && maxTouchPoints > 1) return true;
  // Aparelho só de toque, sem mouse nem hover — vale mesmo quando a UA não
  // diz nada (navegadores menos conhecidos, UA customizada).
  return pointerCoarse && !hoverDisponivel;
}

export function ehDispositivoMobile() {
  return deveBloquearMobile({
    userAgent: navigator.userAgent,
    uaDataMobile: navigator.userAgentData?.mobile ?? null,
    platform: navigator.platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
    hoverDisponivel: window.matchMedia('(hover: hover)').matches,
  });
}

export function mostrarBloqueioMobile() {
  const urlEl = document.getElementById('mobileBlockUrl');
  if (urlEl) urlEl.textContent = location.host;
  document.body.classList.add('mobile-bloqueado');
}
