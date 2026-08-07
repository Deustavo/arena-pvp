// Definição das classes jogáveis. Fonte única de verdade para as
// estatísticas de cada classe — usada pelo servidor (partidas online), pela
// simulação local do bot e pelo menu (cliente) para exibir as características.

import { PROJECTILE_SIZE, PLAYER_SPEED } from './constants.js';

export const CLASSES = {
  atirador: {
    id: 'atirador',
    name: 'Atirador',
    demonName: 'ELai',
    shotCooldownMs: 900,
    damage: 3.5,
    shieldMaxHits: 1,
    maxLives: 9,
    speed: PLAYER_SPEED,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE,
    range: Infinity,
    traits: ['Alcance infinito no tiro'],
    color: '#2f9ee8',
    // Mira/alvo.
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>',
  },
  mago: {
    id: 'mago',
    name: 'Mago',
    demonName: 'MohTas',
    shotCooldownMs: 2300,
    damage: 2,
    shieldMaxHits: 3,
    maxLives: 8,
    speed: PLAYER_SPEED,
    projectileCount: 3,
    coneSpreadDeg: 15,
    projectileSize: PROJECTILE_SIZE,
    range: 320,
    traits: ['Dispara 3 projéteis em cone', 'Alcance menor no tiro'],
    color: '#a463d9',
    // Cajado mágico com brilho na ponta.
    icon: '<svg viewBox="0 0 24 24"><path d="M4 20L14 10"/><path d="M17 2l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2 1.2-3z"/><circle cx="6" cy="6" r="1"/></svg>',
  },
  tank: {
    id: 'tank',
    name: 'Tank',
    demonName: 'MaleS',
    shotCooldownMs: 2000,
    damage: 2.5,
    shieldMaxHits: 5,
    maxLives: 14,
    speed: PLAYER_SPEED,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE * 1.5,
    range: 300,
    traits: ['Vida altíssima', 'Escudo altíssimo', 'Projétil maior', 'Alcance menor no tiro'],
    color: '#3fb87f',
    // Escudo.
    icon: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"/></svg>',
  },
  assassino: {
    id: 'assassino',
    name: 'Assassino',
    demonName: 'Nale-Chi',
    shotCooldownMs: 1750,
    damage: 8,
    shieldMaxHits: 1,
    maxLives: 6,
    speed: PLAYER_SPEED * 1.3,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE,
    range: 255,
    traits: ['Dano altíssimo', 'Vida baixa', 'Alcance bem curto', '30% mais rápido'],
    color: '#e5484d',
    // Adaga.
    icon: '<svg viewBox="0 0 24 24"><path d="M12 2v13"/><path d="M8 6l4-4 4 4-4 4-4-4z"/><path d="M9 15h6l-1.5 5-1.5 2-1.5-2z"/></svg>',
  },
  duelista: {
    id: 'duelista',
    name: 'Duelista',
    demonName: 'Lanu',
    shotCooldownMs: 350,
    damage: 1,
    shieldMaxHits: 2,
    maxLives: 11,
    speed: PLAYER_SPEED * 1.25,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE * 0.75,
    range: 450,
    traits: ['Cadência de tiro altíssima', '25% mais rápido', 'Alcance longo'],
    color: '#f2823a',
    // Espadas cruzadas.
    icon: '<svg viewBox="0 0 24 24"><path d="M4 4l16 16"/><path d="M4 20L20 4"/><path d="M4 4l3 0M4 4l0 3"/><path d="M20 4l-3 0M20 4l0 3"/><path d="M4 20l3 0M4 20l0-3"/><path d="M20 20l-3 0M20 20l0-3"/></svg>',
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    demonName: 'RePa',
    shotCooldownMs: 1200,
    damage: 8,
    longRangeDistance: 450,
    longRangeDamage: 15,
    shieldMaxHits: 1,
    maxLives: 6,
    speed: PLAYER_SPEED,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE * 0.6,
    range: Infinity,
    traits: ['Dano altíssimo em tiros de longa distância', 'Vida baixa', 'Cadência de tiro baixa'],
    color: '#c9c9c9',
    // Mira telescópica.
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>',
  },
};

export const DEFAULT_CLASS_ID = 'atirador';

export function getClass(classId) {
  return CLASSES[classId] || CLASSES[DEFAULT_CLASS_ID];
}
