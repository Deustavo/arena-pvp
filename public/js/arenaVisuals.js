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
  terremotoProgresso, terremotoIntensidade, ventoDirecao, ERUPCAO_RAIO,
} from '../../shared/arenaEvents.js';
import { playEruptionSound, playTerremotoSound } from './audio.js';

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

// Se o terremoto estava ativo no frame anterior, para disparar o som só na
// borda de subida (início do tremor) — mesma ideia de fasesAnteriores logo
// abaixo, mas sem precisar de snapshot: os dois lados chegam à mesma resposta
// de terremotoProgresso(now) porque é pura função do relógio.
let terremotoAtivoAntes = false;

// Deslocamento de câmera para este frame, ou null fora do tremor. Puramente
// visual: nunca mexe na posição real de ninguém, só em onde a cena é
// desenhada (ver render.js, que envolve o desenho inteiro num translate).
//
// A força não é constante: cada ocorrência tem uma intensidade-base diferente
// (terremotoIntensidade, do leve ao devastador) e, dentro da própria duração,
// um envelope em sino (sobe, sustenta perto do pico, cai) em vez de ligar e
// desligar de repente.
export function terremotoShakeOffset(now) {
  const progresso = state.arenaTipo === 'terra' ? terremotoProgresso(now) : null;
  const ativo = progresso !== null;
  if (ativo && !terremotoAtivoAntes) playTerremotoSound();
  terremotoAtivoAntes = ativo;
  if (!ativo) return null;

  const envelope = Math.sin(progresso * Math.PI); // 0 -> 1 no meio -> 0
  const intensidade = terremotoIntensidade(now) * envelope;
  return {
    x: (Math.random() - 0.5) * intensidade,
    y: (Math.random() - 0.5) * intensidade,
  };
}

// --- Vento (areia) -----------------------------------------------------

const VENTO_PARTICLE_COLOR = 'rgba(214, 194, 145, 0.55)';
const VENTO_SPAWN_INTERVAL_MS = 45;

let particulasVento = [];
let ultimoSpawnVento = 0;

// Riscos que atravessam a arena na direção da rajada — a única pista visual
// de que o vento está empurrando os dois jogadores agora (a física em si não
// aparece separada do movimento normal).
export function updateAndDrawVento(now) {
  const direcao = ventoDirecao(state.arenaTipo, now);
  if (direcao !== 0 && now - ultimoSpawnVento > VENTO_SPAWN_INTERVAL_MS) {
    ultimoSpawnVento = now;
    particulasVento.push({
      x: direcao > 0 ? -10 : state.arena.w + 10,
      y: Math.random() * state.arena.h,
      vx: direcao * (5 + Math.random() * 3),
      len: 14 + Math.random() * 10,
    });
  }

  if (!particulasVento.length) return;
  ctx.save();
  ctx.strokeStyle = VENTO_PARTICLE_COLOR;
  ctx.lineWidth = 2;
  particulasVento = particulasVento.filter((p) => {
    p.x += p.vx;
    if (p.x < -20 || p.x > state.arena.w + 20) return false;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - Math.sign(p.vx) * p.len, p.y);
    ctx.stroke();
    return true;
  });
  ctx.restore();
}

// --- Erupções (fogo) -----------------------------------------------------

const ERUPCAO_AVISO_FILL = 'rgba(255, 100, 20, 0.35)';
const ERUPCAO_AVISO_STROKE = 'rgba(255, 170, 60, 0.9)';
const ERUPCAO_EXPLOSAO_COLOR = 'rgba(255, 214, 120, 0.85)';

// Por id, só a fase do frame anterior — é a transição 'aviso' -> 'explosao'
// que dispara o som, mesmo padrão de diffPowerups em powerups.js.
let fasesAnteriores = new Map();

function diffErupcoes(lista) {
  for (const e of lista) {
    if (fasesAnteriores.get(e.id) === 'aviso' && e.fase === 'explosao') playEruptionSound();
  }
  fasesAnteriores = new Map(lista.map((e) => [e.id, e.fase]));
}

export function updateAndDrawErupcoes(now) {
  const lista = state.latestState.erupcoes || [];
  diffErupcoes(lista);

  for (const e of lista) {
    ctx.save();
    if (e.fase === 'explosao') {
      ctx.fillStyle = ERUPCAO_EXPLOSAO_COLOR;
      ctx.beginPath();
      ctx.arc(e.x, e.y, ERUPCAO_RAIO * 1.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const pulse = 1 + Math.sin(now / 120) * 0.08;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = ERUPCAO_AVISO_FILL;
      ctx.beginPath();
      ctx.arc(e.x, e.y, ERUPCAO_RAIO * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = ERUPCAO_AVISO_STROKE;
      ctx.lineWidth = 3;
      ctx.stroke();
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
  terremotoAtivoAntes = false;
}
