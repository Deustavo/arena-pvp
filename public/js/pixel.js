// Base de desenho em pixel art no canvas.
//
// Os personagens e as arenas são pixel art de verdade (spritesheets e
// arena_1..4.png); tudo o que o jogo desenha por código precisa combinar com
// eles. O jeito de garantir isso não é "usar cores retrô": é nunca desenhar
// forma vetorial (`arc`, `stroke`, `setLineDash`) e sim preencher células de
// uma grade fixa com `fillRect` — anti-aliasing, subpixel e alpha contínuo são
// justamente o que faz um desenho parecer vetorial ao lado de um sprite.
//
// PX é o "pixel de arte" em unidades de canvas. O canvas tem 800x600 fixos
// (é o CSS que o encolhe pra caber na tela, ver gameScale.js), então PX = 4
// dá uma arte de 200x150 pixels lógicos — a mesma ordem de grandeza dos
// sprites das classes.
export const PX = 4;

// Toda posição, raio e espessura passa por aqui antes de virar desenho. Meio
// pixel de deslocamento é o que separa um bloco nítido de uma borda cinza.
export function snap(v) {
  return Math.round(v / PX) * PX;
}

// Disco cheio rasterizado: uma célula da grade entra se o centro dela cai
// dentro do raio. Substitui `arc()` + `fill()`.
export function pxCirculo(ctx, cx, cy, r, cor) {
  const gx = snap(cx);
  const gy = snap(cy);
  const gr = Math.max(PX, snap(r));
  ctx.fillStyle = cor;
  for (let y = -gr; y <= gr; y += PX) {
    for (let x = -gr; x <= gr; x += PX) {
      const dx = x + PX / 2;
      const dy = y + PX / 2;
      if (dx * dx + dy * dy <= gr * gr) ctx.fillRect(gx + x, gy + y, PX, PX);
    }
  }
}

// Anel rasterizado, opcionalmente só um trecho angular (é o que desenha os
// segmentos de carga do escudo). `espessura` é arredondada pra grade, então o
// mínimo visível é um bloco. Ângulos seguem a convenção do canvas: 0 à
// direita, crescendo no sentido horário.
export function pxAnel(ctx, cx, cy, r, espessura, cor, a0 = 0, a1 = Math.PI * 2) {
  const gx = snap(cx);
  const gy = snap(cy);
  const gr = Math.max(PX, snap(r));
  const ri = Math.max(0, gr - Math.max(PX, snap(espessura)));
  const volta = Math.PI * 2;
  const completo = a1 - a0 >= volta;
  // Normaliza o intervalo para [0, 2π) mantendo o comprimento, para o teste
  // abaixo funcionar mesmo quando o trecho cruza o zero (o caso comum: o
  // escudo começa em -π/2).
  let ini = a0 % volta;
  if (ini < 0) ini += volta;
  const fim = ini + (a1 - a0);

  ctx.fillStyle = cor;
  for (let y = -gr; y <= gr; y += PX) {
    for (let x = -gr; x <= gr; x += PX) {
      const dx = x + PX / 2;
      const dy = y + PX / 2;
      const d2 = dx * dx + dy * dy;
      if (d2 > gr * gr || d2 < ri * ri) continue;
      if (!completo) {
        let ang = Math.atan2(dy, dx);
        if (ang < 0) ang += volta;
        const dentro = ang >= ini && ang <= fim;
        // O trecho pode passar de 2π; nesse caso a sobra reaparece no começo.
        const dentroDaSobra = fim > volta && ang <= fim - volta;
        if (!dentro && !dentroDaSobra) continue;
      }
      ctx.fillRect(gx + x, gy + y, PX, PX);
    }
  }
}

// Desenha uma grade de pixels [linha, coluna] (o mesmo formato de
// HEART_PIXELS/SHIELD_PIXELS em hud.js) a partir de um canto.
export function pxGrade(ctx, pixels, originX, originY, cor, p = PX) {
  ctx.fillStyle = cor;
  for (const [row, col] of pixels) {
    ctx.fillRect(originX + col * p, originY + row * p, p, p);
  }
}

// Fonte bitmap 3x5. Existe porque os poucos textos desenhados no canvas
// (quantidade do power-up, "2x" da cadência, "-1" de dano) usavam a fonte de
// UI: um texto anti-aliased em cima de um sprite denuncia na hora que o resto
// não é pixel art. Só os caracteres que o jogo realmente desenha.
const GLIFOS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  x: ['000', '101', '010', '101', '000'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
};

const GLIFO_LARGURA = 3;
const GLIFO_ALTURA = 5;
const GLIFO_ESPACO = 1; // colunas em branco entre caracteres

// Largura total em unidades de canvas, para centralizar sem medir texto.
export function pxLarguraTexto(txt, esc = 1) {
  const p = PX * esc;
  return txt.length * (GLIFO_LARGURA + GLIFO_ESPACO) * p - GLIFO_ESPACO * p;
}

// `x`/`y` são o canto superior esquerdo. Caractere desconhecido vira espaço,
// em vez de quebrar o desenho inteiro.
export function pxTexto(ctx, txt, x, y, cor, esc = 1) {
  const p = PX * esc;
  ctx.fillStyle = cor;
  let cursor = 0;
  for (const ch of txt) {
    const glifo = GLIFOS[ch];
    if (glifo) {
      for (let row = 0; row < GLIFO_ALTURA; row++) {
        for (let col = 0; col < GLIFO_LARGURA; col++) {
          if (glifo[row][col] === '1') ctx.fillRect(x + cursor + col * p, y + row * p, p, p);
        }
      }
    }
    cursor += (GLIFO_LARGURA + GLIFO_ESPACO) * p;
  }
}

export function pxTextoCentro(ctx, txt, cx, cy, cor, esc = 1) {
  const p = PX * esc;
  const largura = pxLarguraTexto(txt, esc);
  pxTexto(ctx, txt, snap(cx - largura / 2), snap(cy - (GLIFO_ALTURA * p) / 2), cor, esc);
}

// Transparência em degraus. Um fade contínuo faz a arte passar por dezenas de
// tons intermediários que não existem na paleta — em pixel art o que
// desaparece perde etapas visíveis, não brilho.
export function alphaEmDegraus(a, degraus = 4) {
  const limitado = Math.max(0, Math.min(1, a));
  return Math.ceil(limitado * degraus) / degraus;
}
