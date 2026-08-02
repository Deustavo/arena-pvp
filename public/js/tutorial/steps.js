// Cada etapa tem sua própria animação demonstrando a ação correspondente,
// desenhada com as mesmas formas do jogo (quadrado, tiro, escudo, corações,
// explosão) em miniatura no canvas do tutorial.

import { COLORS } from '../../../shared/constants.js';
import { CLASSES } from '../../../shared/classes.js';
import {
  TUT, lerp, seg, tutPlayer, tutProjectile, tutKeycap, tutCursor, tutHearts, tutLabel,
  tutShield, tutSpark, tutExplosion, tutCtx,
} from './canvasHelpers.js';

// Vidas de exemplo usadas só para ilustrar os passos de vidas/vitória — os
// valores reais dependem da classe escolhida (ver shared/classes.js).
const DEMO_LIVES = 5;

const CLASS_LIST = [CLASSES.atirador, CLASSES.mago, CLASSES.tank];

export const TUTORIAL_STEPS = [
  {
    title: '1. Escolha sua classe',
    text: 'Antes de cada partida você escolhe entre <strong>Atirador</strong>, <strong>Mago</strong> e <strong>Tank</strong>. Cada uma tem vidas, dano, escudo e alcance de tiro diferentes.',
    loop: 3600,
    draw(t) {
      const slot = Math.floor(t / 1200) % CLASS_LIST.length;
      const xs = [56, 152, 248];
      const y = 70;

      CLASS_LIST.forEach((cls, i) => {
        tutPlayer(xs[i], y, COLORS[0], i === slot, false);
        tutLabel(cls.name, xs[i] + TUT.player / 2, y + 38, i === slot ? '#fff' : '#9a9ab0', 12);
      });

      const cls = CLASS_LIST[slot];
      tutLabel(
        `${cls.maxLives} vidas · dano ${cls.damage} · escudo ${cls.shieldMaxHits}`,
        TUT.w / 2, 150, '#7dd3fc', 12
      );
    },
  },
  {
    title: '2. Mover o boneco',
    text: 'Use <strong>W A S D</strong> ou as <strong>setas</strong> do teclado. As teclas podem ser combinadas para andar na diagonal.',
    loop: 4400,
    draw(t) {
      const path = [[52, 70], [130, 70], [130, 122], [52, 122]];
      const legMs = 1100;
      const leg = Math.min(3, Math.floor(t / legMs));
      const k = seg(t, leg * legMs, (leg + 1) * legMs);
      const from = path[leg];
      const to = path[(leg + 1) % 4];
      const x = lerp(from[0], to[0], k);
      const y = lerp(from[1], to[1], k);
      const active = ['right', 'down', 'left', 'up'][leg];

      tutPlayer(x, y, COLORS[0], true, false);
      tutKeycap(248, 52, 'W', active === 'up');
      tutKeycap(220, 80, 'A', active === 'left');
      tutKeycap(248, 80, 'S', active === 'down');
      tutKeycap(276, 80, 'D', active === 'right');
      tutLabel('ou as setas ↑ ↓ ← →', 262, 124, '#8a8aa0', 11);
    },
  },
  {
    title: '3. Atirar no oponente',
    text: 'Clique em qualquer ponto da arena: o tiro sai do seu quadrado na direção do cursor. O intervalo entre tiros, o alcance e o formato do disparo dependem da classe escolhida.',
    loop: 2600,
    draw(t) {
      const target = { x: 268, y: 46 };
      const start = { x: 46, y: 118 };
      const cx = start.x + TUT.player / 2;
      const cy = start.y + TUT.player / 2;
      const tcx = target.x + TUT.player / 2;
      const tcy = target.y + TUT.player / 2;

      const move = seg(t, 0, 900);
      // O cursor para na borda do alvo para não cobrir o quadrado do oponente.
      const curX = lerp(120, tcx - 20, move);
      const curY = lerp(150, tcy - 16, move);

      tutPlayer(start.x, start.y, COLORS[0], true, false);
      tutPlayer(target.x, target.y, COLORS[1], false, false);

      if (t >= 1000) {
        const k = seg(t, 1000, 1900);
        tutProjectile(lerp(cx, tcx, k), lerp(cy, tcy, k), COLORS[0]);
      }
      tutCursor(curX, curY, t >= 900 && t < 1150);
      tutLabel('clique', curX - 12, curY + 2, '#fde68a', 11, 'right');
    },
  },
  {
    title: '4. Vidas por classe',
    text: 'A quantidade de vidas depende da classe escolhida. Todo tiro que acerta tira uma vida do adversário — os corações no topo da tela mostram quanto resta.',
    loop: 3400,
    draw(t) {
      const me = { x: 40, y: 96 };
      const foe = { x: 272, y: 96 };
      const hit = t >= 1400;
      const k = seg(t, 400, 1400);

      tutLabel('Você', 24, 32, '#9a9ab0', 11, 'left');
      tutHearts(24, 44, DEMO_LIVES, false, DEMO_LIVES);
      tutLabel('Oponente', 316, 32, '#9a9ab0', 11, 'right');
      const blink = hit && t < 2100 && Math.floor((t - 1400) / 180) % 2 === 0;
      tutHearts(238, 44, hit ? DEMO_LIVES - 1 : DEMO_LIVES, blink, DEMO_LIVES);

      tutPlayer(me.x, me.y, COLORS[0], true, false);
      const foeFlicker = hit && t < 1800 && Math.floor((t - 1400) / 90) % 2 === 0;
      tutPlayer(foe.x, foe.y, COLORS[1], false, foeFlicker);

      if (!hit) {
        tutProjectile(lerp(me.x + TUT.player, foe.x, k), me.y + TUT.player / 2, COLORS[0]);
      } else if (t < 2100) {
        tutLabel('-1 vida', foe.x + TUT.player / 2, foe.y - 18, '#e63946', 12);
      }
    },
  },
  {
    title: '5. Campo de força',
    text: 'Segure <strong>Espaço</strong> para erguer o campo de força e absorver tiros até esgotar suas cargas — o número de cargas depende da classe. Enquanto defende você fica <strong>imóvel e sem atirar</strong>.',
    loop: 3400,
    draw(t) {
      const me = { x: 60, y: 82 };
      const foe = { x: 262, y: 82 };
      const cx = me.x + TUT.player / 2;
      const cy = me.y + TUT.player / 2;
      const absorbAt = 1500;
      const k = seg(t, 500, absorbAt);
      const impactX = cx + TUT.shieldR + TUT.proj / 2;

      tutPlayer(foe.x, foe.y, COLORS[1], false, false);
      tutPlayer(me.x, me.y, COLORS[0], true, false);
      tutShield(cx, cy, 3, t);

      if (t >= 500 && t < absorbAt) {
        tutProjectile(lerp(foe.x, impactX, k), cy, COLORS[1]);
      }
      tutSpark(impactX, cy, seg(t, absorbAt, absorbAt + 400));

      tutKeycap(28, 152, 'ESPAÇO', true, 74);
      tutLabel('✕ não move    ✕ não atira', 226, 164, '#e6a3a8', 11);
    },
  },
  {
    title: '6. Vence quem zerar o oponente',
    text: 'A partida termina quando um dos jogadores perde todas as vidas. Quem sobrar em pé ganha.',
    loop: 4200,
    draw(t) {
      const me = { x: 40, y: 96 };
      const foe = { x: 272, y: 96 };
      const hitAt = 1300;
      const dead = t >= hitAt;

      tutLabel('Você', 24, 32, '#9a9ab0', 11, 'left');
      tutHearts(24, 44, 2, false, DEMO_LIVES);
      tutLabel('Oponente', 316, 32, '#9a9ab0', 11, 'right');
      const blink = dead && t < 2000 && Math.floor((t - hitAt) / 180) % 2 === 0;
      tutHearts(238, 44, dead ? 0 : 1, blink, DEMO_LIVES);

      tutPlayer(me.x, me.y, COLORS[0], true, false);

      if (!dead) {
        tutPlayer(foe.x, foe.y, COLORS[1], false, false);
        tutProjectile(
          lerp(me.x + TUT.player, foe.x, seg(t, 300, hitAt)),
          me.y + TUT.player / 2,
          COLORS[0]
        );
      } else {
        tutExplosion(foe.x + TUT.player / 2, foe.y + TUT.player / 2, t - hitAt, 900, COLORS[1]);
      }

      if (t >= 2000) {
        tutCtx.save();
        tutCtx.globalAlpha = seg(t, 2000, 2300);
        tutLabel('Você ganhou', TUT.w / 2, 160, '#4ade80', 20);
        tutCtx.restore();
      }
    },
  },
];
