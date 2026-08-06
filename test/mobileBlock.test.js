import test from 'node:test';
import assert from 'node:assert/strict';
import { deveBloquearMobile } from '../public/js/mobileBlock.js';

const DESKTOP = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  uaDataMobile: false,
  platform: 'Linux x86_64',
  maxTouchPoints: 0,
  pointerCoarse: false,
  hoverDisponivel: true,
};

test('desktop comum não é bloqueado', () => {
  assert.equal(deveBloquearMobile(DESKTOP), false);
});

test('notebook com tela sensível ao toque não é bloqueado (tem mouse e teclado)', () => {
  assert.equal(deveBloquearMobile({ ...DESKTOP, maxTouchPoints: 10 }), false);
});

test('bloqueia quando o navegador diz que é mobile via client hints', () => {
  assert.equal(deveBloquearMobile({ ...DESKTOP, uaDataMobile: true }), true);
});

test('bloqueia Android e iPhone pela user agent', () => {
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
  assert.equal(deveBloquearMobile({ ...DESKTOP, uaDataMobile: null, userAgent: android }), true);
  assert.equal(deveBloquearMobile({ ...DESKTOP, uaDataMobile: null, userAgent: iphone }), true);
});

test('bloqueia iPad novo, que se anuncia como Mac desktop mas tem multitoque', () => {
  const ipadOS = {
    ...DESKTOP,
    uaDataMobile: null,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  };
  assert.equal(deveBloquearMobile(ipadOS), true);
  // Mac de verdade (sem multitoque) com a mesma user agent continua liberado.
  assert.equal(deveBloquearMobile({ ...ipadOS, maxTouchPoints: 0 }), false);
});

test('bloqueia aparelho só de toque mesmo com user agent desconhecida', () => {
  assert.equal(deveBloquearMobile({
    ...DESKTOP,
    userAgent: 'Navegador Qualquer/1.0',
    uaDataMobile: null,
    pointerCoarse: true,
    hoverDisponivel: false,
  }), true);
});

test('sem informação nenhuma, não bloqueia', () => {
  assert.equal(deveBloquearMobile(), false);
});
