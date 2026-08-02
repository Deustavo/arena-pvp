// Definição das classes jogáveis. Fonte única de verdade para as
// estatísticas de cada classe — usada pelo servidor (partidas online), pela
// simulação local do bot e pelo menu (cliente) para exibir as características.

import { PROJECTILE_SIZE, PLAYER_SPEED } from './constants.js';

export const CLASSES = {
  atirador: {
    id: 'atirador',
    name: 'Atirador',
    shotCooldownMs: 750,
    damage: 3,
    shieldMaxHits: 1,
    maxLives: 10,
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
    shotCooldownMs: 2000,
    damage: 2,
    shieldMaxHits: 3,
    maxLives: 8,
    speed: PLAYER_SPEED,
    projectileCount: 3,
    coneSpreadDeg: 18,
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
    shotCooldownMs: 2000,
    damage: 4,
    shieldMaxHits: 6,
    maxLives: 12,
    speed: PLAYER_SPEED * 0.9,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE * 2,
    range: 260,
    traits: ['Projétil maior', 'Alcance menor no tiro', '10% mais rápido'],
    color: '#3fb87f',
    // Escudo.
    icon: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"/></svg>',
  },
  assassino: {
    id: 'assassino',
    name: 'Assassino',
    shotCooldownMs: 2500,
    damage: 7,
    shieldMaxHits: 1,
    maxLives: 6,
    speed: PLAYER_SPEED * 1.1,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE,
    range: Infinity,
    traits: ['Dano altíssimo', 'Poucas vidas', '10% mais rápido'],
    color: '#e5484d',
    // Adaga.
    icon: '<svg viewBox="0 0 24 24"><path d="M12 2v13"/><path d="M8 6l4-4 4 4-4 4-4-4z"/><path d="M9 15h6l-1.5 5-1.5 2-1.5-2z"/></svg>',
  },
  duelista: {
    id: 'duelista',
    name: 'Duelista',
    shotCooldownMs: 400,
    damage: 1,
    shieldMaxHits: 2,
    maxLives: 9,
    speed: PLAYER_SPEED * 1.3,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE * 0.75,
    range: 400,
    traits: ['Cadência de tiro altíssima', '30% mais rápido', 'Alcance médio'],
    color: '#f2823a',
    // Espadas cruzadas.
    icon: '<svg viewBox="0 0 24 24"><path d="M4 4l16 16"/><path d="M4 20L20 4"/><path d="M4 4l3 0M4 4l0 3"/><path d="M20 4l-3 0M20 4l0 3"/><path d="M4 20l3 0M4 20l0-3"/><path d="M20 20l-3 0M20 20l0-3"/></svg>',
  },
};

export const DEFAULT_CLASS_ID = 'atirador';

export function getClass(classId) {
  return CLASSES[classId] || CLASSES[DEFAULT_CLASS_ID];
}
