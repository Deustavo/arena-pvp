export const BACKEND_HOST = 'jogo-do-ano-253625384796.southamerica-east1.run.app';

// Em produção o front (Vercel) e o backend (Cloud Run) ficam em domínios
// diferentes; rodando localmente, os dois são o mesmo servidor Node.
const rodandoLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const BACKEND_URL = rodandoLocal
  ? location.origin
  : `https://${BACKEND_HOST}`;

export const WS_URL = rodandoLocal
  ? `ws://${location.host}`
  : `wss://${BACKEND_HOST}`;

// Site key do Cloudflare Turnstile. É pública por natureza (vai no HTML), só
// a secret key fica no servidor. Sem chave configurada aqui, o servidor
// também não recebe TURNSTILE_SECRET_KEY, então o captcha fica desativado por
// completo — útil para rodar localmente sem depender do Cloudflare.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAEFonFtv5EFGlvDJ';
