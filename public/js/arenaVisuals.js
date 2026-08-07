// Desenho dos eventos de arena (ver shared/arenaEvents.js): o fundo temático
// da arena sorteada, o tremor de câmera (terra), as rajadas de vento (areia)
// e o aviso/explosão das erupções (fogo). O gelo não tem desenho próprio — o
// deslize já aparece no próprio movimento do personagem.
//
// Terremoto e vento são só decoração: as regras (quando estão ativos) são
// funções puras do relógio (terremotoAtivo/ventoDirecao), então este módulo
// pode chamá-las direto sem depender de nada no snapshot. Erupção é a
// exceção — posição e fase (aviso/explosão) vêm do snapshot, mesmo padrão de
// powerups.js.

import { ctx, canvas } from './dom.js';
import { state } from './state.js';
import {
  terremotoProgresso, terremotoIntensidade, TERREMOTO_DURACAO_MS, ventoDirecao,
  ERUPCAO_RAIO, ERUPCAO_AVISO_MS, faseFinalFator,
} from '../../shared/arenaEvents.js';
import { playEruptionSound, playEruptionWarningSound, playTerremotoSound } from './audio.js';
import { spawnExplosion } from './explosions.js';
import { isMatchTutorialActive } from './tutorial/matchTutorial.js';
import { PX, snap, pxCirculo, pxAnel } from './pixel.js';

const hasDom = typeof Image !== 'undefined';

const ARENA_BG_SRC = {
  terra: 'assets/arenas/arena_1.png',
  areia: 'assets/arenas/arena_2.png',
  gelo: 'assets/arenas/arena_3.png',
  fogo: 'assets/arenas/arena_4.png',
};

const imagens = new Map();
function loadImage(src) {
  let img = imagens.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imagens.set(src, img);
  }
  return img;
}

// Pré-carrega as quatro, do mesmo jeito que characterSprites.js faz com os
// personagens: sem isso a primeira partida de cada arena mostraria um piscar
// da cor padrão antes da imagem chegar.
if (hasDom) {
  for (const src of Object.values(ARENA_BG_SRC)) loadImage(src);
}

// Fundo da arena: a imagem temática da arena sorteada, ou `corPadrao` enquanto
// ela ainda não carregou (ou fora de partida, quando `state.arenaTipo` é
// null). Desenhado fora do espelhamento de visão — é uma textura genérica de
// terreno, não faz diferença estar espelhada ou não.
export function drawArenaBackground(corPadrao) {
  const src = ARENA_BG_SRC[state.arenaTipo];
  const img = src ? loadImage(src) : null;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.fillStyle = corPadrao;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// --- Terremoto (terra) --------------------------------------------------

// Índice do tremor ouvido no frame anterior, para disparar o som só na borda de
// subida (início de cada tremor) — mesma ideia de fasesAnteriores logo abaixo,
// mas sem precisar de snapshot: os dois lados chegam à mesma resposta de
// terremotoProgresso(now) porque é pura função do relógio.
//
// É um índice e não um booleano por causa da fase final, em que o tremor não
// para mais: um booleano tocaria o rumor uma única vez e depois a câmera
// sacudiria em silêncio por 14s. TERREMOTO_DURACAO_MS divide o ciclo, então o
// índice também fica constante durante cada tremor do trecho periódico.
let terremotoPulsoAntes = null;

// Deslocamento de câmera para este frame, ou null fora do tremor. Puramente
// visual: nunca mexe na posição real de ninguém, só em onde a cena é
// desenhada (ver render.js, que envolve o desenho inteiro num translate).
//
// A força não é constante: cada ocorrência tem uma intensidade-base diferente
// (terremotoIntensidade, do leve ao devastador) e, dentro da própria duração,
// um envelope em sino (sobe, sustenta perto do pico, cai) em vez de ligar e
// desligar de repente. Nos últimos segundos o tremor não para mais (e no
// último segundo cessa de vez) — quem decide isso é terremotoProgresso, a
// partir de state.remainingMs.
export function terremotoShakeOffset(now) {
  if (isMatchTutorialActive()) return null;
  const progresso = state.arenaTipo === 'terra'
    ? terremotoProgresso(now, state.remainingMs)
    : null;
  const pulso = progresso === null ? null : Math.floor(now / TERREMOTO_DURACAO_MS);
  if (pulso !== null && pulso !== terremotoPulsoAntes) playTerremotoSound();
  terremotoPulsoAntes = pulso;
  if (progresso === null) return null;

  const envelope = Math.sin(progresso * Math.PI); // 0 -> 1 no meio -> 0
  // state.remainingMs deixa o tremor mais forte nos últimos segundos de
  // partida (ver faseFinalFator em shared/arenaEvents.js).
  const intensidade = terremotoIntensidade(now, state.remainingMs) * envelope;
  // O deslocamento é travado na grade: a câmera de um jogo pixel art anda em
  // pixels inteiros. Meio pixel de translate joga a cena inteira (fundo,
  // sprites, tudo o que pixel.js desenha) fora do alinhamento e a arena toda
  // fica borrada justamente durante o tremor.
  return {
    x: snap((Math.random() - 0.5) * intensidade),
    y: snap((Math.random() - 0.5) * intensidade),
  };
}

// --- Vento (areia) -----------------------------------------------------

// Três tons de areia em vez de uma cor translúcida só: os riscos passam a ler
// como camadas a distâncias diferentes, e não como um chuvisco uniforme.
const VENTO_TONS = ['#d6c291', '#a89468', '#7d6d4c'];
const VENTO_SPAWN_INTERVAL_MS = 45;

let particulasVento = [];
let ultimoSpawnVento = 0;

// Riscos que atravessam a arena na direção da rajada — a única pista visual
// de que o vento está empurrando os dois jogadores agora (a física em si não
// aparece separada do movimento normal).
export function updateAndDrawVento(now) {
  const direcao = isMatchTutorialActive()
    ? 0
    : ventoDirecao(state.arenaTipo, now, state.remainingMs);
  // Nos últimos segundos de partida a rajada empurra mais forte (ver
  // faseFinalFator) — as partículas nascem mais rápido e mais depressa para
  // a rajada parecer tão mais intensa quanto a física por trás dela.
  const fator = faseFinalFator(state.remainingMs);
  if (direcao !== 0 && now - ultimoSpawnVento > VENTO_SPAWN_INTERVAL_MS / fator) {
    ultimoSpawnVento = now;
    particulasVento.push({
      x: direcao > 0 ? -10 : state.arena.w + 10,
      y: Math.random() * state.arena.h,
      vx: direcao * (5 + Math.random() * 3) * fator,
      // Comprimento em blocos da grade, para o risco nunca terminar no meio
      // de um pixel de arte.
      blocos: 4 + Math.floor(Math.random() * 4),
      tom: VENTO_TONS[Math.floor(Math.random() * VENTO_TONS.length)],
    });
  }

  if (!particulasVento.length) return;
  ctx.save();
  particulasVento = particulasVento.filter((p) => {
    p.x += p.vx;
    if (p.x < -20 || p.x > state.arena.w + 20) return false;
    const largura = p.blocos * PX;
    const x = snap(p.x);
    ctx.fillStyle = p.tom;
    // O risco sai de trás da ponta, no sentido contrário ao da rajada.
    ctx.fillRect(p.vx > 0 ? x - largura : x, snap(p.y), largura, PX);
    return true;
  });
  ctx.restore();
}

// --- Erupções (fogo) -----------------------------------------------------

// Aviso: preenchimento translúcido. O xadrez de blocos (a translucidez
// "certa" em pixel art) chegou a ser usado aqui e foi trocado de volta por
// opacidade — o círculo é grande e o xadrez em cima do chão texturizado da
// arena de fogo virava ruído, além de brigar com os sprites por cima dele.
// A pulsação é a troca entre os dois níveis abaixo, e acelera perto da hora
// de explodir.
const ERUPCAO_AVISO_FILL = '#ff6414';
const ERUPCAO_AVISO_ALPHA = 0.3;
const ERUPCAO_AVISO_ALPHA_FORTE = 0.5;
const ERUPCAO_AVISO_STROKE = '#ffaa3c';
const ERUPCAO_AVISO_INTERNO = '#ff8a1f';
const ERUPCAO_AVISO_INTERNO_FORTE = '#ffd678';
const ERUPCAO_EXPLOSAO_COLOR = '#ffd678';
const ERUPCAO_EXPLOSAO_MEIO = '#ff8a1f';
const ERUPCAO_EXPLOSAO_BORDA = '#c62828';
// Período da piscada do aviso, em ms — e o trecho final, mais rápido, que
// avisa que a lava está prestes a cair.
const ERUPCAO_PISCA_MS = 240;
const ERUPCAO_PISCA_RAPIDA_MS = 120;
const ERUPCAO_PISCA_RAPIDA_A_PARTIR_DE = 0.7;

// Cor das partículas da explosão da erupção: lava, não o vermelho de jogador
// morrendo (ver EXPLOSION_COLOR em explosions.js).
const ERUPCAO_PARTICULA_COLOR = '#ff8a1f';

// Por id, só a fase do frame anterior — são as transições dela que disparam
// som e partículas, mesmo padrão de diffPowerups em powerups.js: id novo em
// 'aviso' = a lava vai cair aqui (alarme), 'aviso' -> 'explosao' = caiu
// (estrondo + partículas).
let fasesAnteriores = new Map();
// Quando cada aviso foi visto por aqui, para saber o quanto falta para a lava
// cair (e acelerar a piscada no fim). O `explodeEm` do snapshot não serve:
// ele está no relógio do servidor, que não é o do cliente.
let avisosVistosEm = new Map();

function diffErupcoes(lista) {
  for (const e of lista) {
    const antes = fasesAnteriores.get(e.id);
    if (antes === undefined && e.fase === 'aviso') {
      avisosVistosEm.set(e.id, Date.now());
      playEruptionWarningSound();
    } else if (antes === 'aviso' && e.fase === 'explosao') {
      playEruptionSound();
      // Partículas no mesmo lugar/instante do flash, dimensionadas pelo raio
      // desta erupção (que já vem intensificado na fase final).
      const raio = e.raio ?? ERUPCAO_RAIO;
      spawnExplosion(e.x, e.y, {
        color: ERUPCAO_PARTICULA_COLOR,
        count: 40,
        spread: raio / ERUPCAO_RAIO * 1.6,
      });
    }
  }
  fasesAnteriores = new Map(lista.map((e) => [e.id, e.fase]));
  for (const id of avisosVistosEm.keys()) {
    if (!fasesAnteriores.has(id)) avisosVistosEm.delete(id);
  }
}

export function updateAndDrawErupcoes(now) {
  const lista = state.latestState.erupcoes || [];
  diffErupcoes(lista);

  for (const e of lista) {
    // `e.raio` vem do snapshot já com a intensificação de fase final aplicada
    // (ver tickErupcoes em shared/arenaEvents.js); ERUPCAO_RAIO é só o
    // fallback para snapshots antigos/sem o campo.
    const raio = e.raio ?? ERUPCAO_RAIO;
    ctx.save();
    if (e.fase === 'explosao') {
      // A lava caiu: três anéis concêntricos do miolo claro à borda em brasa.
      // Dura um tick só — o resto do efeito são as partículas de spawnExplosion.
      pxCirculo(ctx, e.x, e.y, raio * 0.9, ERUPCAO_EXPLOSAO_COLOR);
      pxAnel(ctx, e.x, e.y, raio * 1.15, PX * 3, ERUPCAO_EXPLOSAO_MEIO);
      pxAnel(ctx, e.x, e.y, raio * 1.35, PX * 2, ERUPCAO_EXPLOSAO_BORDA);
    } else {
      const vistoEm = avisosVistosEm.get(e.id) ?? now;
      const decorrido = (now - vistoEm) / ERUPCAO_AVISO_MS;
      // Perto da hora a piscada dobra de velocidade: é o último aviso para
      // sair de dentro do círculo.
      const periodo = decorrido >= ERUPCAO_PISCA_RAPIDA_A_PARTIR_DE
        ? ERUPCAO_PISCA_RAPIDA_MS
        : ERUPCAO_PISCA_MS;
      const denso = Math.floor(now / periodo) % 2 === 0;

      // Só o miolo é translúcido; o anel e as marcas continuam sólidos, senão
      // a borda do alvo — que é o que diz até onde a lava pega — some junto.
      ctx.globalAlpha = denso ? ERUPCAO_AVISO_ALPHA_FORTE : ERUPCAO_AVISO_ALPHA;
      pxCirculo(ctx, e.x, e.y, raio, ERUPCAO_AVISO_FILL);
      ctx.globalAlpha = 1;

      pxAnel(ctx, e.x, e.y, raio, PX, ERUPCAO_AVISO_STROKE);
      pxAnel(
        ctx, e.x, e.y, raio - PX * 3, PX,
        denso ? ERUPCAO_AVISO_INTERNO_FORTE : ERUPCAO_AVISO_INTERNO,
      );

      // Quatro marcas em volta, como a mira de um alvo: separam o aviso do
      // chão da arena de fogo, que já é alaranjado.
      ctx.fillStyle = ERUPCAO_AVISO_INTERNO_FORTE;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        ctx.fillRect(
          snap(e.x + dx * (raio + PX * 2)) - PX / 2,
          snap(e.y + dy * (raio + PX * 2)) - PX / 2,
          PX, PX,
        );
      }
    }
    ctx.restore();
  }
}

// Chamado na limpeza entre partidas (prepareNewMatch em menu.js), mesmo
// padrão de resetPowerupVisuals: sem isso, restos da partida anterior (uma
// erupção que tinha acabado de explodir, partículas de vento no ar) vazariam
// pro primeiro frame da próxima.
export function resetArenaVisuals() {
  particulasVento = [];
  ultimoSpawnVento = 0;
  fasesAnteriores = new Map();
  avisosVistosEm = new Map();
  terremotoPulsoAntes = null;
}
