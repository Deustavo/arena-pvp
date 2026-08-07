// Regras do jogo compartilhadas entre servidor (partidas online) e cliente
// (predição local e simulação do modo bot). Fonte única de verdade: qualquer
// mudança de balanceamento é feita aqui, nunca duplicada.

export const ARENA = { w: 800, h: 600 };
// A arte animada dos personagens (SPRITE_DISPLAY_SIZE = 220px em
// public/js/characterSprites.js) ocupa bem mais espaço na tela do que esse
// valor sugere à primeira vista: o quadro da spritesheet é 100x100, mas o
// próprio boneco (sem contar arma) preenche só uma faixa central dele. Medido
// nos sprites de idle das 6 classes, essa faixa vai de ~17x20px (atirador,
// a mais magra) a ~33x28px (mago, a mais larga) dentro do quadro 100x100 —
// escalado pelos 2.2x do display (220/100), isso é ~37x44 a ~73x62px de
// personagem visível. 44 é o valor que cobre o corpo das 6 classes com folga
// pequena sem incluir a arma (espada do duelista, cajado do mago), que fica
// de fora da hitbox de propósito.
export const PLAYER_SIZE = 44;
export const PLAYER_SPEED = 4;
export const PROJECTILE_SIZE = 8;
export const PROJECTILE_SPEED = 9;
export const SHIELD_RADIUS = 34;
export const TICK_MS = 1000 / 60;
export const COUNTDOWN_MS = 3000;
export const COLORS = ['#e63946', '#457b9d'];

// Usado apenas pela animação ilustrativa do tutorial ("Como jogar"), que não
// reflete as vidas reais de nenhuma classe.
export const MAX_LIVES = 3;
