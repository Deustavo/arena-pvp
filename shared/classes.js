// Definição das classes jogáveis. Fonte única de verdade para as
// estatísticas de cada classe — usada pelo servidor (partidas online), pela
// simulação local do bot e pelo menu (cliente) para exibir as características.

import { PROJECTILE_SIZE } from './constants.js';

export const CLASSES = {
  atirador: {
    id: 'atirador',
    name: 'Atirador',
    shotCooldownMs: 1000,
    damage: 2,
    shieldMaxHits: 1,
    maxLives: 10,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE,
    range: Infinity,
    traits: ['Alcance infinito no tiro'],
    // Mira/alvo.
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>',
  },
  mago: {
    id: 'mago',
    name: 'Mago',
    shotCooldownMs: 2000,
    damage: 3,
    shieldMaxHits: 2,
    maxLives: 8,
    projectileCount: 3,
    coneSpreadDeg: 18,
    projectileSize: PROJECTILE_SIZE,
    range: 320,
    traits: ['Dispara 3 projéteis em cone', 'Alcance menor no tiro'],
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
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE * 2,
    range: 260,
    traits: ['Projétil maior', 'Alcance menor no tiro'],
    // Escudo.
    icon: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"/></svg>',
  },
};

export const DEFAULT_CLASS_ID = 'atirador';

export function getClass(classId) {
  return CLASSES[classId] || CLASSES[DEFAULT_CLASS_ID];
}
