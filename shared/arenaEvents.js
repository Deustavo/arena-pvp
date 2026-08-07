// Eventos das arenas: cada partida sorteia uma arena (terra, areia, gelo ou
// fogo) e ela interfere na partida de um jeito diferente. Regra de jogo, então
// mora aqui em shared/ — mesma fonte para servidor (Match.js), modo treino
// (public/js/bot.js) e o desenho no cliente (que só lê os valores, nunca
// decide nada).
//
// Terremoto, vento e gelo são **determinísticos**: dependem só do relógio
// (`agora`, o mesmo `Date.now()` que já passa para stepPlayers) e não têm
// parte aleatória, então servidor e cliente sempre concordam sem precisar de
// nada novo no protocolo — inclusive o cliente pode desenhar/tocar o tremor e
// o vento sem esperar snapshot nenhum. Só o fogo tem horário sorteado por
// partida e posição capturada em tempo real (mira nos jogadores, ver mais
// abaixo), por isso é o único dos quatro com agenda e estado próprio,
// sincronizado via snapshot (`erupcoes`).
//
// Todos os quatro ficam mais intensos nos últimos ARENA_FASE_FINAL_MS de
// partida (ver faseFinalFator abaixo), a partir do tempo restante
// (`restanteMs`) — o mesmo valor que já vai no HUD e no snapshot (`remainingMs`),
// então a escalada continua determinística: servidor e cliente concordam sem
// precisar de nada novo no protocolo.

import { ARENA, PLAYER_SIZE } from './constants.js';
import { circleHitsRect, clamp } from './physics.js';

export const ARENA_TIPOS = ['terra', 'areia', 'gelo', 'fogo'];

export function sortearArena(rng = Math.random) {
  return ARENA_TIPOS[Math.floor(rng() * ARENA_TIPOS.length)];
}

// ---------------------------------------------------------------------------
// Nos últimos ARENA_FASE_FINAL_MS de partida todo evento de arena fica mais
// intenso — pressiona quem está levando a partida para o fim do tempo
// regulamentar, e não só o desempate. `restanteMs` é o mesmo tempo restante
// de shared/matchTimer.js, então os efeitos escalam junto com o relógio que
// já aparece no HUD, sem precisar de nenhum estado novo.
// ---------------------------------------------------------------------------

export const ARENA_FASE_FINAL_MS = 15000;
const ARENA_FASE_FINAL_FATOR = 1.6;

export function faseFinalFator(restanteMs = Infinity) {
  return restanteMs <= ARENA_FASE_FINAL_MS ? ARENA_FASE_FINAL_FATOR : 1;
}

// Os eventos que ficam contínuos na fase final (terremoto e vento) param de vez
// com este tempo restante: o último segundo — e todo o desempate depois dele —
// fica limpo, para o momento que decide a partida não ser disputado com a tela
// sacudindo nem com os dois jogadores sendo empurrados.
export const ARENA_EVENTO_FIM_MS = 1000;

export function faseFinalContinua(restanteMs = Infinity) {
  return restanteMs <= ARENA_FASE_FINAL_MS && restanteMs > ARENA_EVENTO_FIM_MS;
}

// ---------------------------------------------------------------------------
// Terra: terremotos periódicos. Puramente visual/sonoro (câmera tremendo, ver
// public/js/arenaVisuals.js) — não mexe em posição, velocidade ou dano, então
// não precisa de nenhuma aplicação em stepPlayers.
// ---------------------------------------------------------------------------

const TERREMOTO_CICLO_MS = 18000;
export const TERREMOTO_DURACAO_MS = 4500;

// Intensidade de pico (força do tremor de câmera, em px — ver
// terremotoShakeOffset em public/js/arenaVisuals.js) do mais fraco ao mais
// forte. Varia a cada ocorrência, não só dentro de uma: nem todo terremoto é
// igual.
const TERREMOTO_INTENSIDADES = [5, 9, 13, 18];

// Nos últimos ARENA_FASE_FINAL_MS o tremor deixa de ser periódico e passa a ser
// **contínuo**: o ciclo de espera não existe mais e o progresso só oscila numa
// faixa que nunca chega às pontas do envelope (onde ele valeria 0), então a
// câmera nunca para de tremer — até ARENA_EVENTO_FIM_MS, quando para de vez.
const TERREMOTO_CONTINUO_MIN = 0.25;
const TERREMOTO_CONTINUO_MAX = 0.75;

// Ativo por TERREMOTO_DURACAO_MS a cada TERREMOTO_CICLO_MS, só em função do
// relógio — e sem interrupção na fase final, ver terremotoProgresso.
export function terremotoAtivo(agora, restanteMs = Infinity) {
  return terremotoProgresso(agora, restanteMs) !== null;
}

// Progresso (0 a 1) dentro do tremor em andamento, ou null fora dele. Usado
// para variar a intensidade ao longo da própria duração — sobe, sustenta
// perto do pico e cai no final — em vez de um tremor ligado/desligado com
// força constante.
export function terremotoProgresso(agora, restanteMs = Infinity) {
  if (restanteMs <= ARENA_EVENTO_FIM_MS) return null;
  if (faseFinalContinua(restanteMs)) {
    const fase = (agora % TERREMOTO_DURACAO_MS) / TERREMOTO_DURACAO_MS;
    const pulso = (1 - Math.cos(fase * 2 * Math.PI)) / 2; // 0 -> 1 -> 0, sem quebra entre ciclos
    return TERREMOTO_CONTINUO_MIN + pulso * (TERREMOTO_CONTINUO_MAX - TERREMOTO_CONTINUO_MIN);
  }
  const fase = agora % TERREMOTO_CICLO_MS;
  return fase < TERREMOTO_DURACAO_MS ? fase / TERREMOTO_DURACAO_MS : null;
}

// Intensidade-base (px) deste terremoto — muda a cada ocorrência (índice do
// ciclo), então uma hora é só um tremor leve e em outra é bem mais forte.
// Nos últimos ARENA_FASE_FINAL_MS de partida (`restanteMs`) o tremor fica
// mais forte ainda, ver faseFinalFator.
export function terremotoIntensidade(agora, restanteMs = Infinity) {
  const ciclo = Math.floor(agora / TERREMOTO_CICLO_MS);
  const base = TERREMOTO_INTENSIDADES[ciclo % TERREMOTO_INTENSIDADES.length];
  return base * faseFinalFator(restanteMs);
}

// ---------------------------------------------------------------------------
// Areia: rajadas de vento periódicas que empurram os dois jogadores para o
// mesmo lado (esquerda/direita alternando a cada ciclo) enquanto duram. Não
// é vantagem de ninguém — os dois levam o mesmo empurrão — então não precisa
// de sorteio por partida: a direção vem do índice do ciclo.
//
// Nos últimos ARENA_FASE_FINAL_MS o vento **não para mais**: a pausa entre
// rajadas deixa de existir e o empurrão só troca de lado na virada do ciclo,
// até parar de vez em ARENA_EVENTO_FIM_MS (mesma regra do terremoto).
// ---------------------------------------------------------------------------

const VENTO_CICLO_MS = 10000;
const VENTO_DURACAO_MS = 3500;
export const VENTO_FORCA = 1.6; // px por tick empurrados na direção do vento

// 0 (parado), 1 (direita) ou -1 (esquerda).
export function ventoDirecao(arenaTipo, agora, restanteMs = Infinity) {
  if (arenaTipo !== 'areia') return 0;
  if (restanteMs <= ARENA_EVENTO_FIM_MS) return 0;
  const ciclo = Math.floor(agora / VENTO_CICLO_MS);
  const direcao = ciclo % 2 === 0 ? 1 : -1;
  if (faseFinalContinua(restanteMs)) return direcao;
  return (agora % VENTO_CICLO_MS) < VENTO_DURACAO_MS ? direcao : 0;
}

// Força efetiva do vento (px/tick), mais forte nos últimos ARENA_FASE_FINAL_MS
// de partida — ver faseFinalFator.
export function ventoForca(restanteMs = Infinity) {
  return VENTO_FORCA * faseFinalFator(restanteMs);
}

// ---------------------------------------------------------------------------
// Gelo: piso escorregadio o jogo inteiro. Em vez do movimento parar assim que
// solta a tecla (como nas outras arenas), a velocidade desliza: cada tick só
// se aproxima da velocidade "alvo" do input, mantendo parte do embalo
// anterior. Quanto mais perto de 1, mais escorrega.
// ---------------------------------------------------------------------------

export const GELO_ATRITO = 0.92;
// Nos últimos ARENA_FASE_FINAL_MS de partida o piso fica ainda mais
// escorregadio (atrito mais perto de 1 = mais embalo retido por tick).
const GELO_ATRITO_FASE_FINAL = 0.97;

export function geloAtrito(restanteMs = Infinity) {
  return restanteMs <= ARENA_FASE_FINAL_MS ? GELO_ATRITO_FASE_FINAL : GELO_ATRITO;
}

// ---------------------------------------------------------------------------
// Fogo: erupções mirando os jogadores. Cada onda cai com **as duas** ao mesmo
// tempo, uma em cima de cada jogador — tentando acertar, não em posição
// aleatória. Cada uma avisa por ERUPCAO_AVISO_MS (círculo pulsando no chão)
// antes de explodir, causando dano e empurrando para longe do centro quem
// ainda estiver dentro na hora da explosão (dá tempo de sair andando). Só o
// horário das ondas é sorteado uma vez por partida (mesmo padrão de
// criarPowerups em shared/powerups.js); a posição de cada erupção da onda é
// capturada da posição real do jogador no instante em que ela surge, não
// pré-sorteada — por isso precisa de estado + agenda e vai no snapshot.
// ---------------------------------------------------------------------------

export const ERUPCAO_RAIO = 110;
// Tempo entre o círculo de aviso aparecer (com o alarme sonoro, ver
// playEruptionWarningSound) e a explosão. Precisa ser longo o bastante para
// caber uma reação humana **mais** a caminhada até fora do raio: a erupção
// nasce em cima do jogador, então sair de dentro dela custa ERUPCAO_RAIO px de
// deslocamento, não um passo.
export const ERUPCAO_AVISO_MS = 2300;
export const ERUPCAO_DANO = 1;
export const ERUPCAO_KNOCKBACK = 22;

// Janelas de onda em tempo restante de partida (mesma convenção de
// JANELAS_SPAWN_MS em shared/powerups.js). Seis janelas (o dobro das três
// originais) para a arena de fogo pressionar mais: uma onda nova (duas
// erupções, uma por jogador) a cada ~9-10s de partida.
const ERUPCAO_JANELAS_MS = [
  { de: 55000, ate: 48000 },
  { de: 46000, ate: 39000 },
  { de: 37000, ate: 30000 },
  { de: 28000, ate: 21000 },
  { de: 19000, ate: 12000 },
  { de: 10000, ate: 4000 },
];

export function criarErupcoes(rng = Math.random) {
  return {
    agenda: ERUPCAO_JANELAS_MS.map((janela) => ({
      surgeEmRestanteMs: janela.ate + rng() * (janela.de - janela.ate),
      surgiu: false,
    })),
    ativas: [],
    proximoId: 1,
  };
}

// Um passo das erupções, chamado a cada tick depois de mover os jogadores
// (mesma posição no pipeline de tickPowerups). Não faz nada fora da arena de
// fogo. Cada erupção fica em `ativas` com `fase: 'aviso'` até o tempo de
// explodir; nesse tick ela aplica dano/knockback, muda para `fase: 'explosao'`
// (pro cliente flashar/tocar som ao ver a transição no snapshot) e é
// removida no tick seguinte.
export function tickErupcoes(arenaTipo, estado, players, restanteMs, agora) {
  if (arenaTipo !== 'fogo' || !estado) return;

  for (const item of estado.agenda) {
    if (item.surgiu || restanteMs > item.surgeEmRestanteMs) continue;
    item.surgiu = true;
    // Nos últimos ARENA_FASE_FINAL_MS a onda vem maior, empurra mais forte e
    // avisa por menos tempo — ver faseFinalFator. O raio vai no snapshot
    // (`e.raio`) para o cliente desenhar o círculo de aviso/explosão do
    // tamanho certo, em vez do ERUPCAO_RAIO fixo.
    const fator = faseFinalFator(restanteMs);
    const raio = ERUPCAO_RAIO * fator;
    const knockback = ERUPCAO_KNOCKBACK * fator;
    const avisoMs = ERUPCAO_AVISO_MS / fator;
    // As duas caem juntas, cada uma mirada na posição atual de um jogador —
    // depois disso o alvo é fixo (não persegue quem se move durante o aviso).
    for (const alvo of players) {
      estado.ativas.push({
        id: estado.proximoId++,
        x: alvo.x + PLAYER_SIZE / 2,
        y: alvo.y + PLAYER_SIZE / 2,
        explodeEm: agora + avisoMs,
        fase: 'aviso',
        raio,
        knockback,
      });
    }
  }

  if (!estado.ativas.length) return;

  estado.ativas = estado.ativas.filter((e) => {
    if (e.fase === 'explosao') return false;
    if (agora < e.explodeEm) return true;
    e.fase = 'explosao';
    for (const p of players) {
      if (!p.alive || !circleHitsRect(e.x, e.y, e.raio, p.x, p.y, PLAYER_SIZE, PLAYER_SIZE)) continue;
      const cx = p.x + PLAYER_SIZE / 2;
      const cy = p.y + PLAYER_SIZE / 2;
      const ang = Math.atan2(cy - e.y, cx - e.x) || 0;
      p.x = clamp(p.x + Math.cos(ang) * e.knockback, 0, ARENA.w - PLAYER_SIZE);
      p.y = clamp(p.y + Math.sin(ang) * e.knockback, 0, ARENA.h - PLAYER_SIZE);
      p.lives = Math.max(0, p.lives - ERUPCAO_DANO);
      if (p.lives === 0) p.alive = false;
    }
    return true;
  });
}
