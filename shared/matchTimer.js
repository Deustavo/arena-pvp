// Cronômetro da partida e desempate por morte súbita.
//
// Toda partida tem tempo regulamentar (MATCH_DURATION_MS). Se alguém vence
// antes, o cronômetro simplesmente para junto com o loop da partida (quem
// chama para de tickar). Se o tempo acaba com os dois vivos, entra o
// desempate: a partida "congela" (ninguém se move nem atira) e, depois de
// DESEMPATE_DELAY_MS, os dois jogadores perdem um coração por vez a cada
// DESEMPATE_PASSO_MS até alguém zerar. Quem zerar primeiro perde; se os dois
// zerarem no mesmo passo, é empate.
//
// Como o desempate mexe nas vidas dos jogadores, ele é regra de jogo e mora
// aqui em shared/ — é a mesma função usada pelo servidor (partidas online) e
// pelo loop do modo bot no cliente.

export const MATCH_DURATION_MS = 2 * 60 * 1000;
// Respiro entre o fim do tempo e o começo do dreno, para o jogador entender
// que a partida parou antes dos corações começarem a cair.
export const DESEMPATE_DELAY_MS = 2500;
export const DESEMPATE_PASSO_MS = 700;

export function criarCronometro(agora) {
  return { fimEm: agora + MATCH_DURATION_MS, desempateEm: null, proximoDreno: 0 };
}

export function emDesempate(cronometro) {
  return !!cronometro && cronometro.desempateEm !== null;
}

export function tempoRestanteMs(cronometro, agora) {
  if (!cronometro) return MATCH_DURATION_MS;
  if (emDesempate(cronometro)) return 0;
  return Math.max(0, cronometro.fimEm - agora);
}

// Empurra o fim do tempo regulamentar para frente. Usado enquanto o relógio
// não deve correr (tutorial interativo), sem precisar de um estado de "pausa"
// separado.
export function adiarFim(cronometro, ms) {
  if (cronometro && !emDesempate(cronometro)) cronometro.fimEm += ms;
}

// "m:ss" para o cronômetro do HUD. Arredonda para cima para o relógio só
// mostrar 0:00 quando o tempo realmente acabou.
export function formatarTempo(restanteMs) {
  const totalSegundos = Math.max(0, Math.ceil(restanteMs / 1000));
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${minutos}:${String(segundos).padStart(2, '0')}`;
}

// Um passo do cronômetro, chamado a cada tick da partida. Devolve o que
// aconteceu neste tick para quem chama decidir o que fazer (congelar a
// partida, encerrar, etc.):
//   { iniciouDesempate, drenou, fim, winnerIndex }
// `winnerIndex` é null quando o fim é empate (os dois zeraram no mesmo passo).
export function tickCronometro(cronometro, players, agora) {
  const evento = { iniciouDesempate: false, drenou: false, fim: false, winnerIndex: null };

  if (!emDesempate(cronometro)) {
    if (agora < cronometro.fimEm) return evento;
    cronometro.desempateEm = agora;
    cronometro.proximoDreno = agora + DESEMPATE_DELAY_MS;
    evento.iniciouDesempate = true;
    return evento;
  }

  if (agora < cronometro.proximoDreno) return evento;
  cronometro.proximoDreno = agora + DESEMPATE_PASSO_MS;
  evento.drenou = true;

  for (const p of players) {
    if (!p.alive) continue;
    p.lives = Math.max(0, p.lives - 1);
    if (p.lives === 0) p.alive = false;
  }

  const [p0, p1] = players;
  if (!p0.alive || !p1.alive) {
    evento.fim = true;
    // Os dois zerando no mesmo passo é empate (winnerIndex null): ambos
    // explodem e ninguém leva a vitória.
    evento.winnerIndex = !p0.alive && !p1.alive ? null : (p0.alive ? 0 : 1);
  }
  return evento;
}
