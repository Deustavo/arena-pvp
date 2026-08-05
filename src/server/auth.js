import { betterAuth } from 'better-auth';
import { bearer, captcha } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { db } from './db.js';
import { enviarVerificacaoEmail, enviarResetSenha } from './email.js';
import { sanitizeNickname, isValidAccountName, ACCOUNT_NAME_ERROR } from '../../shared/nickname.js';

// URL pública do backend (Cloud Run) — base dos links gerados nos e-mails.
const BASE_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
// Origem do front (Vercel em produção, mesma origem em desenvolvimento).
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://demonarena.vercel.app';

export const TRUSTED_ORIGINS = [
  FRONTEND_ORIGIN,
  BASE_URL,
  'http://localhost:3000',
];

// O nome da conta é o nome do jogador exibido em partida, então precisa ser
// único. O índice único em LOWER(name) (ver schema.js) é a garantia real;
// esta checagem existe para devolver uma mensagem de erro amigável.
//
// A validação de caracteres também é feita no formulário do front, mas aqui é
// o que realmente vale: a rota de cadastro pode ser chamada direto.
async function garantirNomeDisponivel(name) {
  const nome = sanitizeNickname(name);
  if (!isValidAccountName(nome)) {
    throw new APIError('BAD_REQUEST', {
      message: ACCOUNT_NAME_ERROR,
    });
  }
  const { rows } = await db.execute({
    sql: 'SELECT id FROM user WHERE LOWER(name) = LOWER(?) LIMIT 1',
    args: [nome],
  });
  if (rows.length > 0) {
    throw new APIError('BAD_REQUEST', {
      message: 'Esse nome de jogador já está em uso.',
    });
  }
  return nome;
}

export const auth = betterAuth({
  database: {
    dialect: new LibsqlDialect({
      url: process.env.TURSO_DATABASE_URL || 'file:./data/local.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
    type: 'sqlite',
  },
  baseURL: BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: TRUSTED_ORIGINS,

  advanced: {
    ipAddress: {
      // O `X-Forwarded-For` que chega no Cloud Run pode ter mais de um
      // endereço: o cliente é livre para mandar o dele, e a infraestrutura do
      // Google acrescenta o IP real no fim da lista.
      //
      // Sem `trustedProxies` o Better Auth descarta qualquer lista com mais de
      // um endereço e joga TODOS os jogadores num contador único de rate
      // limit. Aí as 5 tentativas de login deixam de ser por jogador e passam
      // a valer para o jogo inteiro — qualquer um forçaria essa situação de
      // propósito e travaria o login de todo mundo.
      //
      // Com a lista abaixo preenchida ele percorre o `X-Forwarded-For` da
      // direita para a esquerda e usa o último endereço — o que o Google
      // escreveu, que o cliente não consegue forjar. O Cloud Run não expõe os
      // IPs dos próprios proxies na lista, então o valor aqui só precisa ser
      // uma faixa que nunca apareça: link-local não é usado por cliente real.
      trustedProxies: ['169.254.0.0/16'],
    },
  },

  // Proteção contra brute force: limita tentativas por IP. Usa a tabela
  // `rateLimit` (banco) em vez de memória, já que o processo pode reiniciar
  // ou rodar em mais de uma instância no Cloud Run.
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/forget-password': { window: 60, max: 3 },
      '/reset-password': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await enviarResetSenha({ to: user.email, url });
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await enviarVerificacaoEmail({ to: user.email, url });
    },
    // Envia o link ao criar a conta e reenvia automaticamente se o jogador
    // tentar entrar sem ter confirmado o e-mail ainda.
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const name = await garantirNomeDisponivel(user.name);
          return { data: { ...user, name } };
        },
      },
    },
  },

  // O front (Vercel) e o backend (Cloud Run) ficam em domínios diferentes, o
  // que faria do cookie de sessão um cookie de terceiros — bloqueado por
  // padrão em vários navegadores. Com o plugin bearer o cliente guarda o token
  // e o envia no header Authorization, sem depender de cookie cross-site.
  //
  // O plugin captcha protege cadastro, login e pedido de reset de senha
  // (endpoints padrão) contra bots. Sem TURNSTILE_SECRET_KEY configurada, o
  // Better Auth lançaria erro ao validar options — então em desenvolvimento
  // sem a env var o plugin fica de fora e o captcha simplesmente não roda.
  plugins: [
    bearer(),
    ...(process.env.TURNSTILE_SECRET_KEY
      ? [captcha({ provider: 'cloudflare-turnstile', secretKey: process.env.TURNSTILE_SECRET_KEY })]
      : []),
  ],
});

if (!process.env.TURNSTILE_SECRET_KEY && process.env.NODE_ENV === 'production') {
  console.warn('[auth] TURNSTILE_SECRET_KEY ausente em produção — captcha desativado no cadastro/login/reset de senha.');
}
