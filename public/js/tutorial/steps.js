// Cada etapa tem sua própria animação demonstrando a ação correspondente,
// desenhada com as mesmas formas do jogo (quadrado, tiro, escudo, corações,
// explosão) em miniatura no canvas do tutorial.

import { MAX_LIVES, COLORS } from '../../../shared/constants.js';
import {
  TUT, lerp, seg, tutPlayer, tutProjectile, tutKeycap, tutCursor, tutHearts, tutLabel,
  tutShield, tutSpark, tutExplosion, tutRoundRect, tutCtx,
} from './canvasHelpers.js';

export const TUTORIAL_STEPS = [
  {
    title: '1. Mover o boneco',
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
    title: '2. Atirar no oponente',
    text: 'Clique em qualquer ponto da arena: o tiro sai do seu quadrado na direção do cursor. Há um pequeno intervalo entre um tiro e outro.',
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
    title: '3. Três vidas por jogador',
    text: 'Cada jogador começa com <strong>3 vidas</strong>. Todo tiro que acerta tira uma vida do adversário — os corações no topo da tela mostram quanto resta.',
    loop: 3400,
    draw(t) {
      const me = { x: 40, y: 96 };
      const foe = { x: 272, y: 96 };
      const hit = t >= 1400;
      const k = seg(t, 400, 1400);

      tutLabel('Você', 24, 32, '#9a9ab0', 11, 'left');
      tutHearts(24, 44, MAX_LIVES, false, MAX_LIVES);
      tutLabel('Oponente', 316, 32, '#9a9ab0', 11, 'right');
      const blink = hit && t < 2100 && Math.floor((t - 1400) / 180) % 2 === 0;
      tutHearts(268, 44, hit ? 2 : 3, blink, MAX_LIVES);

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
    title: '4. Campo de força',
    text: 'Segure <strong>Espaço</strong> para erguer o campo de força e absorver os tiros. Enquanto defende você fica <strong>imóvel e sem atirar</strong>.',
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
    title: '5. O escudo tem 3 cargas',
    text: 'O campo de força aguenta <strong>3 tiros na partida inteira</strong> — cada arco do círculo é uma carga. Sem cargas ele não pode mais ser usado.',
    loop: 5800,
    draw(t) {
      const me = { x: 60, y: 82 };
      const foe = { x: 262, y: 82 };
      const cx = me.x + TUT.player / 2;
      const cy = me.y + TUT.player / 2;
      const impactX = cx + TUT.shieldR + TUT.proj / 2;
      const shots = [400, 1400, 2400];
      const travel = 800;

      let charges = 3;
      for (const s of shots) if (t >= s + travel) charges -= 1;
      const broken = charges <= 0;

      tutPlayer(foe.x, foe.y, COLORS[1], false, false);

      // Sem cargas o quarto tiro passa pelo escudo e acerta o jogador.
      const lastShot = 4100;
      const lastHit = lastShot + 900;
      const hitMe = t >= lastHit;
      const meFlicker = hitMe && t < lastHit + 400 && Math.floor((t - lastHit) / 90) % 2 === 0;
      tutPlayer(me.x, me.y, COLORS[0], true, meFlicker);

      if (!broken) {
        tutShield(cx, cy, charges, t);
        for (const s of shots) {
          if (t >= s && t < s + travel) {
            tutProjectile(lerp(foe.x, impactX, seg(t, s, s + travel)), cy, COLORS[1]);
          }
          tutSpark(impactX, cy, seg(t, s + travel, s + travel + 350));
        }
      } else {
        tutLabel('escudo esgotado', cx, me.y - 26, '#e63946', 12);
        if (t >= lastShot && t < lastHit) {
          const k = seg(t, lastShot, lastHit);
          tutProjectile(lerp(foe.x, me.x + TUT.player, k), cy, COLORS[1]);
        }
        if (hitMe) tutLabel('-1 vida', cx, cy + 34, '#e63946', 12);
      }

      tutLabel(`cargas restantes: ${Math.max(0, charges)}`, 170, 168, '#8a8aa0', 11);
    },
  },
  {
    title: '6. Vence quem zerar o oponente',
    text: 'A partida termina quando um dos jogadores perde as <strong>3 vidas</strong>. Quem sobrar em pé ganha.',
    loop: 4200,
    draw(t) {
      const me = { x: 40, y: 96 };
      const foe = { x: 272, y: 96 };
      const hitAt = 1300;
      const dead = t >= hitAt;

      tutLabel('Você', 24, 32, '#9a9ab0', 11, 'left');
      tutHearts(24, 44, 2, false, MAX_LIVES);
      tutLabel('Oponente', 316, 32, '#9a9ab0', 11, 'right');
      const blink = dead && t < 2000 && Math.floor((t - hitAt) / 180) % 2 === 0;
      tutHearts(268, 44, dead ? 0 : 1, blink, MAX_LIVES);

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
  {
    title: '7. Escolha o modo de jogo',
    text: '<strong>Jogar Online</strong> te coloca na fila para um 1x1 contra outra pessoa. <strong>Jogar contra Bot</strong> é treino offline, começa na hora.',
    loop: 3800,
    draw(t) {
      const btnW = 190;
      const btnX = (TUT.w - btnW) / 2;
      const onlineY = 46;
      const botY = 104;
      const overBot = t >= 1900;

      const drawBtn = (y, label, base, hover, active) => {
        tutRoundRect(btnX, y, btnW, 38, 8);
        tutCtx.fillStyle = active ? hover : base;
        tutCtx.fill();
        tutLabel(label, TUT.w / 2, y + 19, '#fff', 14);
      };

      drawBtn(onlineY, 'Jogar Online', '#457b9d', '#5b96bb', !overBot);
      drawBtn(botY, 'Jogar contra Bot', '#e63946', '#f0525e', overBot);

      const curY = lerp(onlineY + 26, botY + 26, seg(t, 1600, 1900));
      tutCursor(TUT.w / 2 + 40, curY, false);

      tutLabel(
        overBot ? 'treino offline, sem espera' : '1x1 contra outro jogador',
        TUT.w / 2,
        168,
        '#8a8aa0',
        11
      );
    },
  },
];
