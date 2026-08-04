// Perfis de dificuldade do bot: controlam mira, reflexo (atraso para
// reagir e cooldown extra entre tiros) e a chance de desviar/escudar
// contra tiros recebidos. `dodgeChance`/`shieldChance` são decididos uma
// única vez por ameaça (não a cada tick), então valores baixos realmente
// significam "erra com frequência". `shotJitterMs` é a variação aleatória
// somada ao cooldown de tiro (quanto menor, mais consistente/rápido o
// bot atira). `predictive` faz o bot mirar na posição futura do jogador
// (com base na velocidade atual), em vez de mirar onde ele está agora.
export const BOT_DIFFICULTIES = {
  noob: {
    id: 'noob',
    name: 'Noob',
    aimSpread: 110,
    cooldownExtraMs: 1000,
    shotJitterMs: 500,
    dodgeChance: 0.2,
    shieldChance: 0.25,
    trackingErrorPx: 60,
    reactionDelayMs: 400,
    predictive: false,
  },
  intermediario: {
    id: 'intermediario',
    name: 'Intermediário',
    aimSpread: 30,
    cooldownExtraMs: 350,
    shotJitterMs: 300,
    dodgeChance: 0.65,
    shieldChance: 0.7,
    trackingErrorPx: 15,
    reactionDelayMs: 130,
    predictive: false,
  },
  dificil: {
    id: 'dificil',
    name: 'Difícil',
    aimSpread: 12,
    cooldownExtraMs: 120,
    shotJitterMs: 100,
    dodgeChance: 0.85,
    shieldChance: 0.85,
    trackingErrorPx: 6,
    reactionDelayMs: 50,
    predictive: true,
  },
  demoniaco: {
    id: 'demoniaco',
    name: 'Demoníaco',
    aimSpread: 0,
    cooldownExtraMs: 0,
    shotJitterMs: 0,
    dodgeChance: 1,
    shieldChance: 1,
    trackingErrorPx: 0,
    reactionDelayMs: 0,
    predictive: true,
  },
};

export const DEFAULT_BOT_DIFFICULTY = 'intermediario';

export function getBotDifficulty(id) {
  return BOT_DIFFICULTIES[id] || BOT_DIFFICULTIES[DEFAULT_BOT_DIFFICULTY];
}
