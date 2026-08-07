// Desenho e feedback dos power-ups da arena. As regras (quando aparecem, o que
// fazem, quem pegou) são de shared/powerups.js — aqui só entram a bolha
// desenhada no canvas, a animação de coleta e os sons.
//
// Ninguém avisa este módulo que uma bolha apareceu ou foi coletada: os dois
// eventos saem da comparação da lista de power-ups do snapshot com a do frame
// anterior, o mesmo padrão que o HUD usa para tiro/dano/bloqueio (hud.js).
// Assim vale de graça para os dois jogadores, para os três modos (online,
// treino e espectador) e sem mensagem nova no protocolo.

import { ctx } from './dom.js';
import { state } from './state.js';
import { HEART_PIXELS, SHIELD_PIXELS } from './hud.js';
import { playPowerupSpawnSound, playPowerupPickupSound } from './audio.js';
import { POWERUP_RADIUS, POWERUP_ZONE } from '../../shared/powerups.js';

// Cinza um pouco mais escuro que o fundo da arena (ARENA_BG_COLOR em
// render.js): marca a região onde as bolhas nascem sem virar decoração.
const ZONE_BORDER_COLOR = 'rgba(0, 0, 0, 0.6)';

const CORES = {
  vida: '#e63946',
  escudo: '#4aa8ff',
  cadencia: '#facc15',
  velocidade: '#f2f2f2',
};

const BUBBLE_FILL = 'rgba(255, 255, 255, 0.10)';
const BUBBLE_STROKE = 'rgba(255, 255, 255, 0.55)';
const BUBBLE_HIGHLIGHT = 'rgba(255, 255, 255, 0.75)';

// Sobe e desce no lugar enquanto ninguém pega — é o "pulando" que faz a bolha
// chamar atenção em cima do fundo estático da arena.
const BOB_AMPLITUDE_PX = 7;
const BOB_PERIODO_MS = 900;

// Aparecer do nada, em cima de uma troca de tiros, passa batido: a bolha entra
// crescendo (com um pequeno estouro) neste tempo.
const SPAWN_ANIM_MS = 320;

const PICKUP_ANIM_MS = 650;
const PICKUP_RISE_PX = 34;
const PICKUP_LABEL_FONT = 'bold 20px "Chakra Petch", sans-serif';

const ICON_PIXEL = 2.5;

// Selo com a quantidade, na borda da bolha.
const BADGE_RADIUS = 9;
const BADGE_FONT = 'bold 13px "Chakra Petch", sans-serif';
const BADGE_TEXT_COLOR = '#141414';
const BADGE_STROKE = 'rgba(20, 20, 20, 0.85)';

// Power-ups do frame anterior, por id. É a diferença contra este mapa que
// revela bolha nova (id que apareceu) e coleta (id que sumiu) — ver o
// comentário no topo.
let anteriores = new Map();
// Animações de coleta em andamento (só visual, expiram sozinhas).
let coletas = [];
// Primeira vez que cada bolha foi vista, para a animação de entrada.
let vistosEm = new Map();

// Chamado na limpeza entre partidas (prepareNewMatch em menu.js): sem isso as
// bolhas da partida anterior contariam como "coletadas" na primeira comparação
// da próxima, tocando som e animação do nada.
export function resetPowerupVisuals() {
  anteriores = new Map();
  coletas = [];
  vistosEm = new Map();
}

function diffPowerups(lista, now) {
  const atuais = new Map(lista.map((pu) => [pu.id, pu]));

  // No desempate as bolhas são descartadas junto com os projéteis (a partida
  // congela, ninguém andaria até elas) — isso não é coleta, então nem som nem
  // animação: só reaproveita a lista nova como base da próxima comparação.
  if (state.desempate) {
    anteriores = atuais;
    vistosEm = new Map();
    return;
  }

  for (const id of atuais.keys()) {
    if (anteriores.has(id)) continue;
    vistosEm.set(id, now);
    playPowerupSpawnSound();
  }

  for (const [id, pu] of anteriores) {
    if (atuais.has(id)) continue;
    vistosEm.delete(id);
    // Uma bolha só sai da arena de um jeito: alguém pegou.
    coletas.push({ ...pu, startTime: now });
    playPowerupPickupSound();
  }

  anteriores = atuais;
}

function drawPixelGrid(pixels, originX, originY, cor, pixel = ICON_PIXEL) {
  ctx.fillStyle = cor;
  for (const [row, col] of pixels) {
    ctx.fillRect(originX + col * pixel, originY + row * pixel, pixel, pixel);
  }
}

// Cadência: só "2x". Qualquer desenho (raio, chama, seta de recarga) exige
// saber de antemão o que ele quer dizer; o número diz direto que o tiro sai no
// dobro da velocidade.
const ICONE_CADENCIA_FONT = 'bold 21px "Chakra Petch", sans-serif';
function drawIconeCadencia(cor) {
  ctx.fillStyle = cor;
  ctx.font = ICONE_CADENCIA_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('2x', 0, 1);
}

// Velocidade: as duas setas para o lado, o mesmo símbolo que o painel de stats
// da classe já usa na linha "Velocidade" — quem viu a modal de seleção
// reconhece na arena.
function drawIconeVelocidade(cor) {
  ctx.strokeStyle = cor;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const offsetX of [-8, 1]) {
    ctx.beginPath();
    ctx.moveTo(offsetX, -7);
    ctx.lineTo(offsetX + 7, 0);
    ctx.lineTo(offsetX, 7);
    ctx.stroke();
  }
}

// Ícone centrado na origem atual do contexto.
function drawIcone(tipo, cor) {
  if (tipo === 'vida') {
    drawPixelGrid(HEART_PIXELS, -(7 * ICON_PIXEL) / 2, -(6 * ICON_PIXEL) / 2, cor);
  } else if (tipo === 'escudo') {
    drawPixelGrid(SHIELD_PIXELS, -(7 * ICON_PIXEL) / 2, -(8 * ICON_PIXEL) / 2, cor);
  } else if (tipo === 'cadencia') {
    drawIconeCadencia(cor);
  } else {
    drawIconeVelocidade(cor);
  }
}

// Vida é o único power-up de valor variável (1 a 3 corações): sem o número, a
// bolha não diz se vale um coração ou três. Vai num selo na borda, e não ao
// lado do ícone, porque o coração já ocupa quase toda a largura útil da bolha.
function drawBadgeQuantidade(quantidade, cor) {
  const bx = POWERUP_RADIUS * 0.7;
  const by = POWERUP_RADIUS * 0.7;

  ctx.beginPath();
  ctx.arc(bx, by, BADGE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = cor;
  ctx.fill();
  ctx.strokeStyle = BADGE_STROKE;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = BADGE_TEXT_COLOR;
  ctx.font = BADGE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${quantidade}`, bx, by + 1);
}

// A bolha e o ícone dentro dela são desenhados sem espelhamento de visão: o
// raio e as setas ficariam apontando para o lado errado (e o "+N" da coleta,
// ilegível) para quem nasceu do lado direito da arena. Cancela o flip só da
// forma, girando em torno do próprio x — que já está no sistema espelhado e
// por isso continua caindo no lugar certo da tela. Mesmo truque de
// floatingIcons.js.
function comFlipCancelado(x, desenhar) {
  ctx.save();
  if (state.viewFlipped) {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }
  desenhar();
  ctx.restore();
}

function drawBolha(pu, now) {
  const cor = CORES[pu.tipo] || CORES.vida;
  const nasceuEm = vistosEm.get(pu.id) ?? now;
  const t = Math.min(1, (now - nasceuEm) / SPAWN_ANIM_MS);
  // Cresce passando um pouco do tamanho final antes de assentar.
  const escala = t >= 1 ? 1 : Math.sin((t * Math.PI) / 2) * (1 + (1 - t) * 0.25);
  const bob = Math.sin(now / BOB_PERIODO_MS * Math.PI * 2) * BOB_AMPLITUDE_PX * t;
  const cy = pu.y + bob;
  const r = POWERUP_RADIUS * escala;

  comFlipCancelado(pu.x, () => {
    ctx.translate(pu.x, cy);

    // Halo na cor do tipo: é o que dá para identificar o power-up de longe,
    // antes de o ícone ficar legível.
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = BUBBLE_FILL;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = BUBBLE_STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Brilho no canto superior esquerdo: o que faz a bolha parecer vidro em
    // vez de um círculo vazado.
    ctx.strokeStyle = BUBBLE_HIGHLIGHT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, Math.PI * 1.05, Math.PI * 1.45);
    ctx.stroke();

    ctx.scale(escala, escala);
    drawIcone(pu.tipo, cor);
    if (pu.tipo === 'vida') drawBadgeQuantidade(pu.quantidade, cor);
  });
}

// Coleta: anel se abrindo e o ícone subindo com o valor ganho ("+2" no power-up
// de vida), no mesmo espírito dos ícones flutuantes de dano (floatingIcons.js).
function drawColeta(coleta, now) {
  const t = (now - coleta.startTime) / PICKUP_ANIM_MS;
  const cor = CORES[coleta.tipo] || CORES.vida;
  const cy = coleta.y - t * PICKUP_RISE_PX;

  comFlipCancelado(coleta.x, () => {
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.translate(coleta.x, cy);

    ctx.strokeStyle = cor;
    ctx.lineWidth = 3 * (1 - t);
    ctx.beginPath();
    ctx.arc(0, 0, POWERUP_RADIUS * (1 + t * 1.6), 0, Math.PI * 2);
    ctx.stroke();

    if (coleta.tipo === 'vida' || coleta.tipo === 'escudo') {
      const label = `+${coleta.quantidade}`;
      ctx.font = PICKUP_LABEL_FONT;
      ctx.fillStyle = cor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(label, 0, -POWERUP_RADIUS - 6);
    }
    drawIcone(coleta.tipo, cor);
  });
}

// Região onde as bolhas nascem, no centro da arena. Desenhada logo depois do
// fundo (e antes de tudo o mais) para ficar por baixo de jogadores e tiros.
export function drawPowerupZone() {
  ctx.save();
  ctx.strokeStyle = ZONE_BORDER_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(POWERUP_ZONE.x, POWERUP_ZONE.y, POWERUP_ZONE.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Bolhas ainda na arena. Desenhadas antes dos jogadores: quem está em cima da
// bolha aparece na frente dela, não atrás.
export function updateAndDrawPowerups(now) {
  const lista = state.latestState.powerups || [];
  diffPowerups(lista, now);
  coletas = coletas.filter((c) => now - c.startTime < PICKUP_ANIM_MS);
  for (const pu of lista) drawBolha(pu, now);
}

// Animação de coleta, desenhada depois dos jogadores — o sprite tem 220px e
// engoliria o anel e o "+N" se eles ficassem por baixo.
export function drawPowerupPickups(now) {
  for (const coleta of coletas) drawColeta(coleta, now);
}
