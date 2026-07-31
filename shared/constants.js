// Regras do jogo compartilhadas entre servidor (partidas online) e cliente
// (predição local e simulação do modo bot). Fonte única de verdade: qualquer
// mudança de balanceamento é feita aqui, nunca duplicada.

export const ARENA = { w: 800, h: 600 };
export const PLAYER_SIZE = 30;
export const PLAYER_SPEED = 4;
export const PROJECTILE_SIZE = 8;
export const PROJECTILE_SPEED = 9;
export const PROJECTILE_COOLDOWN_MS = 300;
export const MAX_LIVES = 3;
export const SHIELD_RADIUS = 34;
export const SHIELD_MAX_HITS = 3;
export const TICK_MS = 1000 / 60;
export const COUNTDOWN_MS = 3000;
export const COLORS = ['#e63946', '#457b9d'];
