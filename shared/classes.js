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
  },
  mago: {
    id: 'mago',
    name: 'Mago',
    shotCooldownMs: 1000,
    damage: 3,
    shieldMaxHits: 2,
    maxLives: 8,
    projectileCount: 3,
    coneSpreadDeg: 18,
    projectileSize: PROJECTILE_SIZE,
    range: Infinity,
    traits: ['Dispara 3 projéteis em cone', 'Alcance infinito no tiro'],
  },
  tank: {
    id: 'tank',
    name: 'Tank',
    shotCooldownMs: 2000,
    damage: 2,
    shieldMaxHits: 3,
    maxLives: 12,
    projectileCount: 1,
    coneSpreadDeg: 0,
    projectileSize: PROJECTILE_SIZE * 2,
    range: 260,
    traits: ['Projétil maior', 'Alcance menor no tiro'],
  },
};

export const DEFAULT_CLASS_ID = 'atirador';

export function getClass(classId) {
  return CLASSES[classId] || CLASSES[DEFAULT_CLASS_ID];
}
