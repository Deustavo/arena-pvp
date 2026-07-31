// Regras do jogo compartilhadas entre servidor (partidas online) e cliente
// (predição local e simulação do modo bot). Fonte única de verdade: qualquer
// mudança de balanceamento é feita aqui, nunca duplicada.

export const ARENA = { w: 800, h: 600 };
export const PLAYER_SIZE = 30;
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
