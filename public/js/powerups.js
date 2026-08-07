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
import {
  PX, snap, pxCirculo, pxAnel, pxGrade, pxTextoCentro, alphaEmDegraus,
} from './pixel.js';

// Cinza um pouco mais escuro que o fundo da arena (ARENA_BG_COLOR em
// render.js): marca a região onde as bolhas nascem sem virar decoração.
const ZONE_BORDER_COLOR = 'rgba(0, 0, 0, 0.6)';
// A borda da zona é pontilhada: um bloco a cada tantos passos de ângulo. Um
// círculo contínuo de 4px de espessura viraria uma parede desenhada no chão.
const ZONE_DOT_PASSOS = 90;

const CORES = {
  vida: '#e63946',
  escudo: '#4aa8ff',
  cadencia: '#facc15',
  velocidade: '#f2f2f2',
};

const BUBBLE_FILL = 'rgba(255, 255, 255, 0.10)';
const BUBBLE_STROKE = '#e8e8e8';
const BUBBLE_HIGHLIGHT = '#ffffff';

// Sobe e desce no lugar enquanto ninguém pega — é o "pulando" que faz a bolha
// chamar atenção em cima do fundo estático da arena. A altura é contada em
// blocos inteiros (não em pixels de tela): meio bloco de deslocamento
// desalinharia a bolha da grade e borraria a borda dela.
const BOB_BLOCOS = 2;
const BOB_PERIODO_MS = 900;

// Aparecer do nada, em cima de uma troca de tiros, passa batido: a bolha entra
// crescendo (com um pequeno estouro) neste tempo.
const SPAWN_ANIM_MS = 320;
// O ícone só entra quando a bolha já está quase do tamanho final. Escalar
// pixel art por um fator fracionário destrói a grade — melhor o ícone
// aparecer inteiro um pouco depois do que crescer borrado junto.
const SPAWN_ICONE_A_PARTIR_DE = 0.75;

const PICKUP_ANIM_MS = 650;
const PICKUP_RISE_PX = 34;

// A bolha tem só 40px de diâmetro (POWERUP_RADIUS é o raio de coleta, não dá
// para desenhá-la maior do que ela realmente é). Num bloco de 4px o coração
// de 7 células já ocuparia quase toda a largura útil e a bolha viraria um
// borrão colorido — então o conteúdo dela usa a grade fina de 2px, a mesma
// escala dos corações do HUD (HEART_PIXEL_SIZE em hud.js). A bolha em si, o
// halo e o anel continuam na grade de PX.
const ICON_PX = PX / 2;

// Selo com a quantidade, na borda da bolha: um quadrado com moldura escura,
// porque em pixel art um círculo pequeno com contorno não sobra pixel para
// ler o número dentro. Em células de ICON_PX, como o resto do conteúdo.
const BADGE_BLOCOS = 5;
const BADGE_TEXT_COLOR = '#141414';
const BADGE_STROKE = '#141414';

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

// Velocidade: as duas setas para o lado, o mesmo símbolo que o painel de stats
// da classe já usa na linha "Velocidade" — quem viu a modal de seleção
// reconhece na arena. Como grade de pixels (e não dois `stroke()` com ponta
// arredondada), no mesmo formato de HEART_PIXELS/SHIELD_PIXELS.
const VELOCIDADE_PIXELS = [];
for (const offset of [0, 3]) {
  VELOCIDADE_PIXELS.push(
    [0, offset], [1, offset + 1], [2, offset + 2], [3, offset + 1], [4, offset],
  );
}
const VELOCIDADE_COLS = 6;
const VELOCIDADE_ROWS = 5;

// Ícone centrado na origem atual do contexto (que já está travada na grade).
// Cadência é só "2x" na fonte bitmap: qualquer desenho (raio, chama, seta de
// recarga) exige saber de antemão o que ele quer dizer, e o número diz direto
// que o tiro sai no dobro da velocidade.
function drawIcone(tipo, cor) {
  if (tipo === 'vida') {
    pxGrade(ctx, HEART_PIXELS, -(7 * ICON_PX) / 2, -(6 * ICON_PX) / 2, cor, ICON_PX);
  } else if (tipo === 'escudo') {
    pxGrade(ctx, SHIELD_PIXELS, -(7 * ICON_PX) / 2, -(8 * ICON_PX) / 2, cor, ICON_PX);
  } else if (tipo === 'cadencia') {
    pxTextoCentro(ctx, '2x', 0, 0, cor, ICON_PX / PX);
  } else {
    pxGrade(
      ctx, VELOCIDADE_PIXELS,
      -(VELOCIDADE_COLS * ICON_PX) / 2, -(VELOCIDADE_ROWS * ICON_PX) / 2, cor, ICON_PX,
    );
  }
}

// Vida é o único power-up de valor variável (1 a 3 corações): sem o número, a
// bolha não diz se vale um coração ou três. Vai num selo na borda, e não ao
// lado do ícone, porque o coração já ocupa quase toda a largura útil da bolha.
function drawBadgeQuantidade(quantidade, cor) {
  const bx = snap(POWERUP_RADIUS * 0.7);
  const by = snap(POWERUP_RADIUS * 0.7);
  const lado = BADGE_BLOCOS * ICON_PX;

  ctx.fillStyle = BADGE_STROKE;
  ctx.fillRect(bx - lado / 2 - ICON_PX, by - lado / 2 - ICON_PX, lado + ICON_PX * 2, lado + ICON_PX * 2);
  ctx.fillStyle = cor;
  ctx.fillRect(bx - lado / 2, by - lado / 2, lado, lado);
  pxTextoCentro(ctx, `${quantidade}`, bx, by, BADGE_TEXT_COLOR, ICON_PX / PX);
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
  // Cresce passando um pouco do tamanho final antes de assentar. O raio é
  // travado na grade, então o crescimento acontece em degraus de um bloco.
  const escala = t >= 1 ? 1 : Math.sin((t * Math.PI) / 2) * (1 + (1 - t) * 0.25);
  const bob = Math.round(Math.sin(now / BOB_PERIODO_MS * Math.PI * 2) * BOB_BLOCOS * t) * PX;
  const cy = snap(pu.y) + bob;
  const r = snap(POWERUP_RADIUS * escala);
  const x = snap(pu.x);

  comFlipCancelado(pu.x, () => {
    ctx.translate(x, cy);

    // Halo na cor do tipo: é o que dá para identificar o power-up de longe,
    // antes de o ícone ficar legível. Em pixel art ele não é um alpha que
    // desvanece, e sim dois anéis de intensidade diferente.
    pxAnel(ctx, 0, 0, r * 1.5, PX * 2, hexComAlpha(cor, 0.22));
    pxAnel(ctx, 0, 0, r * 1.25, PX * 2, hexComAlpha(cor, 0.4));

    pxCirculo(ctx, 0, 0, r, BUBBLE_FILL);
    pxAnel(ctx, 0, 0, r, PX, BUBBLE_STROKE);

    // Reflexo: três pixels soltos no quadrante superior esquerdo. É o mínimo
    // que faz a bolha parecer vidro — um arco de brilho, na escala dela,
    // ocuparia metade da borda.
    ctx.fillStyle = BUBBLE_HIGHLIGHT;
    ctx.fillRect(-snap(r * 0.6), -snap(r * 0.5), PX, PX);
    ctx.fillRect(-snap(r * 0.5), -snap(r * 0.62), PX, PX);
    ctx.fillRect(-snap(r * 0.38), -snap(r * 0.68), PX, PX);

    if (escala < SPAWN_ICONE_A_PARTIR_DE) return;
    drawIcone(pu.tipo, cor);
    if (pu.tipo === 'vida') drawBadgeQuantidade(pu.quantidade, cor);
  });
}

// As cores dos power-ups são hex de 6 dígitos (CORES acima); o halo precisa
// delas com transparência sem duplicar cada cor numa versão rgba.
function hexComAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Coleta: anel se abrindo e o ícone subindo com o valor ganho ("+2" no power-up
// de vida), no mesmo espírito dos ícones flutuantes de dano (floatingIcons.js).
function drawColeta(coleta, now) {
  const t = (now - coleta.startTime) / PICKUP_ANIM_MS;
  const cor = CORES[coleta.tipo] || CORES.vida;
  const cy = coleta.y - t * PICKUP_RISE_PX;

  comFlipCancelado(coleta.x, () => {
    // Some em degraus, não num fade contínuo: a bolha vai perdendo etapas
    // visíveis, como o resto da arte.
    ctx.globalAlpha = alphaEmDegraus(1 - t);
    ctx.translate(snap(coleta.x), snap(cy));

    // O anel abre e afina em blocos inteiros.
    const espessura = t < 0.5 ? PX * 2 : PX;
    pxAnel(ctx, 0, 0, POWERUP_RADIUS * (1 + t * 1.6), espessura, cor);

    if (coleta.tipo === 'vida' || coleta.tipo === 'escudo') {
      pxTextoCentro(ctx, `+${coleta.quantidade}`, 0, -POWERUP_RADIUS - PX * 3, cor);
    }
    drawIcone(coleta.tipo, cor);
  });
}

// Região onde as bolhas nascem, no centro da arena. Desenhada logo depois do
// fundo (e antes de tudo o mais) para ficar por baixo de jogadores e tiros.
export function drawPowerupZone() {
  ctx.save();
  ctx.fillStyle = ZONE_BORDER_COLOR;
  for (let i = 0; i < ZONE_DOT_PASSOS; i++) {
    // Um bloco sim, um não: é o pontilhado, feito no ângulo em vez de com
    // setLineDash (que num círculo sai serrilhado e anti-aliased).
    if (i % 2 !== 0) continue;
    const ang = (i / ZONE_DOT_PASSOS) * Math.PI * 2;
    ctx.fillRect(
      snap(POWERUP_ZONE.x + Math.cos(ang) * POWERUP_ZONE.r),
      snap(POWERUP_ZONE.y + Math.sin(ang) * POWERUP_ZONE.r),
      PX, PX,
    );
  }
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
