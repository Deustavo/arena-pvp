// Sprite de personagem desenhado em DOM (não no canvas): usa a mesma
// spritesheet da partida (`characterSprites.js`) e anda os quadros por CSS
// (`background-position` em `steps()`), sem loop de JS. É o que dá o
// personagem de verdade nas miniaturas de classe e no preview da modal de
// seleção, no lugar do quadrado colorido antigo.
//
// O elemento carrega só os dados da tira (imagem, nº de quadros, duração) em
// custom properties; o enquadramento (zoom e centralização do personagem
// dentro do quadro de 100x100) é todo no CSS, em `.class-sprite`.
import { getSpriteAnimation, hasCharacterSprite } from './characterSprites.js';

export { hasCharacterSprite };

// Devolve os dados da animação aplicada (inclusive `durationMs`, útil para
// voltar ao idle quando o ataque acabar) ou `null` quando a classe não tem
// arte própria — aí quem chama cai no ícone SVG antigo.
export function applyClassSprite(el, classId, anim = 'idle') {
  if (!el) return null;
  const sheet = getSpriteAnimation(classId, anim);
  if (!sheet) {
    el.classList.remove('class-sprite');
    el.style.backgroundImage = '';
    return null;
  }

  const durationMs = sheet.frames * sheet.frameMs;
  el.classList.add('class-sprite');
  // Ataque/dano/morte não repetem: travam no último quadro, igual ao canvas.
  el.classList.toggle('class-sprite-once', !sheet.loop);
  el.style.backgroundImage = `url("${sheet.src}")`;
  el.style.setProperty('--sprite-frames', sheet.frames);
  el.style.setProperty('--sprite-duration', `${durationMs}ms`);
  // Reinicia a animação do zero: sem isso, trocar de classe ou de animação
  // continuaria do quadro em que a anterior estava.
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  return { ...sheet, durationMs };
}
