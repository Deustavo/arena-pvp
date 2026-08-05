# Planejamento — Contas de usuário, autenticação e histórico de partidas

> Documento de planejamento para revisão. Nada aqui foi implementado ainda.

## Decisões já tomadas (revisão de 2026-08-03)

- ✅ Partidas contra bot **ficam de fora** do histórico (qualquer bot: modo offline e o fallback do matchmaking). Só partidas online entre dois humanos são gravadas.
- ✅ Nome do jogador (`user.name`) deve ser **único** — validado no sign-up via hook do Better Auth.
- ✅ Aprovada a adição das dependências de auth/banco.
- ✅ Banco: **Turso** (ver comparação em §1.2) — free tier sem teto de horas de compute e sem cold start, formato melhor para o padrão de uso de um jogo.
- ✅ E-mail: **SMTP do Gmail** (custo zero, sem domínio) via `nodemailer`, com envio isolado em `src/server/email.js` para migrar para domínio próprio + Resend no futuro trocando um arquivo só.

Sem pendências — planejamento fechado para implementação.

## Status da implementação

**Fase 1 (Fundação) — ✅ concluída e validada localmente.** Entregue:
`src/server/db.js`, `auth.js`, `email.js`, `schema.js`, `scripts/migrate.mjs`,
montagem de `/api/auth/*` + CORS no `httpServer.js`, scripts `db:migrate` no
package.json. Fluxos verificados ponta a ponta contra o servidor real:
cadastro, envio de e-mail pelo Gmail, verificação de e-mail, bloqueio de login
não verificado, sessão via bearer token, reset de senha (link, troca de senha,
token de uso único) e unicidade de nome (hook + índice no banco). `npm test`:
129 testes passando.

**Fase 2 (E-mails) — ✅ concluída junto com a fase 1** (o SMTP do Gmail já está
integrado e validado; falta apenas a página `reset-password.html`, que é UI da
fase 3).

**Descoberta que mudou o plano:** o front está na Vercel
(`playarenapvp.vercel.app`) e o backend no Cloud Run — **domínios diferentes**.
O cookie de sessão seria um cookie de terceiros, bloqueado por padrão em vários
navegadores. Solução adotada: plugin **`bearer`** do Better Auth — o cliente
guarda o token (devolvido no header `set-auth-token`) e o envia em
`Authorization: Bearer`, sem depender de cookie cross-site. Isso também
simplifica o handshake do WebSocket (§4), que passa a receber o token por query
string em vez de depender de cookie.

**Banco de produção provisionado:** `arena-pvp` no Turso (grupo `default`; a
URL e o token ficam no `.env.production`, fora do git — o repositório é
público).
Migrations aplicadas e verificadas — tabelas `user`, `session`, `account`,
`verification`, `match_history` e os índices `idx_user_name_unico` e
`idx_match_history_user`. Cadastro testado contra o banco real. Credenciais em
`.env.production` (fora do git).

⚠️ **Falta configurar os secrets no Cloud Run** antes do primeiro deploy com
auth: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`. Sem isso o servidor sobe
mas cai no banco local efêmero e não envia e-mail.

ℹ️ O grupo do Turso fica em `aws-us-east-1` (o free tier permite um grupo só, e
já havia outros bancos lá). Latência de ~120 ms até o Cloud Run em
`southamerica-east1`, o que só afeta login e gravação de fim de partida — nunca
o game loop, que é 100 % em memória.

**Fase 3 (UI de conta) — ✅ concluída e validada no navegador.** Entregue:
`public/js/auth.js` (cliente REST + token no localStorage),
`public/js/authScreens.js` (modal entrar/criar conta/esqueci a senha e o estado
logado×convidado do menu), `public/reset-password.html` +
`public/js/resetPassword.js`, estilos no `style.css`, `BACKEND_URL` no
`config.js` e o campo `user` no `state.js`. 24 verificações em navegador real
(Playwright) passando, sem erros de JS. `npm test`: 132 testes.

**Dois bugs pré-existentes encontrados e corrigidos no caminho:**

1. `resolveRequestPath` usava `req.url` cru, então **query string virava parte
   do nome do arquivo** — `/reset-password.html?token=...` (exatamente o formato
   do link de e-mail) dava 404. Corrigido e coberto por teste de regressão;
   o path traversal continua bloqueado, inclusive percent-encoded.
2. `onlineCount.js` fixava `https://BACKEND_HOST` mesmo rodando localmente,
   quebrando com erro de CORS em desenvolvimento. Agora usa `BACKEND_URL`.

**Um risco de deploy eliminado:** o client libsql abre a conexão já na
importação, e `data/` não é versionado — num checkout limpo (o caso do Cloud
Build) só importar `db.js` lançava exceção, o que **derrubaria `npm test` e
bloquearia o deploy**. `db.js` agora cria o diretório antes de conectar;
verificado rodando a suíte sem `data/` e sem `.env`.

**Fase 4 (identidade no WebSocket) — ✅ concluída e validada.** Entregue:
`src/server/wsIdentity.js` (resolução de identidade com `getSession`
injetável, logo testável sem banco), handshake assíncrono no `wsServer.js`,
`WS_URL` no `config.js` e o envio do token no `network.js`. Regras:

- Conta logada → o nome em partida vem da conta e o `nickname` da query string
  é **ignorado** (impede se passar por um jogador registrado).
- Convidado → comportamento atual, inalterado.
- Token inválido ou banco fora do ar → cai para convidado em vez de recusar a
  conexão; ninguém fica sem jogar por causa de auth.
- Desconexão durante a validação da sessão não deixa socket morto na fila.

Validação: 10 testes automatizados em `test/wsIdentity.test.js` + teste
manual com clientes WS reais (tentativa de forjar nickname bloqueada) + partida
real entre dois navegadores (conta × convidado) com os nomes corretos no
countdown e no HUD.

**Armadilha encontrada:** o token de sessão é base64 e contém `+`, `/` e `=`.
Em query string um `+` cru vira **espaço**, corrompendo o token silenciosamente
(cai para convidado sem erro visível). O cliente monta a URL com
`URLSearchParams`, que codifica certo — há um teste de regressão travando esse
contrato. Qualquer código futuro que monte essa URL na mão vai quebrar.

**Fase 5 (histórico de partidas) — ✅ concluída e validada.** Entregue:
`src/server/matchHistory.js` (parte pura separada do banco), gravação no
`endMatch` do `Match.js`, endpoint `GET /api/me/matches` (histórico + resumo) e
a tela "Histórico" no menu (`public/js/profile.js`).

Regras confirmadas em teste com partidas reais:
- Uma linha por jogador logado; partida entre dois logados grava as duas
  perspectivas (`win` de um lado, `loss` do outro).
- Convidado não gera linha, mas aparece como oponente de quem tem conta.
- Partida entre dois convidados não grava nada.
- Partida contra bot fica de fora (`shouldRecordMatch`).
- O endpoint devolve **sempre** o histórico da sessão — o `userId` nunca vem do
  cliente. Sem token ou com token inválido: 401.
- Falha de banco ao gravar não atrapalha o fim da partida (só loga), e a
  gravação não bloqueia o `gameover`.
- Nome de oponente é escapado antes de ir para o HTML (convidado escolhe o
  próprio nickname, então é texto de terceiro).

**Todas as fases planejadas estão concluídas.** 150 testes passando, inclusive
num ambiente limpo sem `data/` e sem `.env` (o cenário do Cloud Build).

## Rate limit (proteção contra brute force)

Configurado em `auth.js` e testado: login 5/60s, reset de senha 3/60s, demais
rotas 100/60s, contadores persistidos na tabela `rateLimit`.

**Cuidado importante — identificação do jogador por IP.** Desde a v1.6.21 o
Better Auth descarta o `X-Forwarded-For` quando ele tem mais de um endereço e
`advanced.ipAddress.trustedProxies` não está configurado. Nesse caso todos os
jogadores caem num contador **único**: bastaria alguém errar a senha 5 vezes
para travar o login do jogo inteiro por 1 minuto — e dá para provocar de
propósito, já que qualquer cliente pode mandar o próprio `X-Forwarded-For` e o
Cloud Run acrescenta o IP real no fim.

Corrigido com `trustedProxies: ['169.254.0.0/16']`, que faz a lista ser lida da
direita para a esquerda, usando o endereço escrito pelo Google (não forjável).
A faixa link-local nunca aparece na lista — ela existe só para ativar essa
leitura. Verificado localmente: cada IP ganha seu contador, o endereço forjado
é ignorado, e um atacante que estoura o próprio limite **não** impede outros
jogadores de entrar.

⚠️ Conferir depois do primeiro deploy: se a tabela `rateLimit` mostrar chaves
começando com `no-trusted-ip`, o formato do `X-Forwarded-For` do Cloud Run é
diferente do assumido e a configuração precisa ser revista.

## Pendências antes do deploy

1. **Secrets no Cloud Run** (não configurados): `TURSO_DATABASE_URL`,
   `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GMAIL_USER`,
   `GMAIL_APP_PASSWORD`, `TURNSTILE_SECRET_KEY`. Sem eles o servidor sobe, mas
   usa banco local efêmero, não envia e-mail e fica sem captcha.
2. **`FRONTEND_ORIGIN`** precisa bater com a URL real da Vercel, senão o CORS
   das rotas de auth bloqueia o front.
3. **Migrations em produção**: rodar `npm run db:migrate` apontando para o
   Turso a cada mudança de schema (não roda sozinho no deploy).
4. **Trocar a senha de app do Gmail** por uma de uma conta dedicada ao jogo —
   a atual é de uma conta pessoal e foi colada no chat.

## Objetivo

Permitir que o jogador crie uma conta no Demon Arena com:

- Nome do jogador vinculado à conta.
- Histórico de partidas por conta (base para um futuro ranking global).
- Opção de jogar como **convidado** (sem conta, como hoje).
- E-mail verificado obrigatório para contas.
- Redefinição de senha via link seguro por e-mail.
- Custo zero de infraestrutura (tiers gratuitos).

---

## 1. Decisões de tecnologia

### 1.1 Autenticação: **Better Auth** ✅ recomendado

Avaliação (pedida no requisito):

| Critério | Resultado |
|---|---|
| Gratuito | Sim — biblioteca open source (MIT), roda no nosso próprio servidor, sem SaaS pago. |
| Compatível com Node puro (`http`) | Sim — `toNodeHandler(auth)` de `better-auth/node` devolve um handler `(req, res)` que montamos direto no `httpServer.js`, sem Express. |
| ESM | Sim — compatível com `"type": "module"` e Node 20 (Dockerfile atual). |
| E-mail verificado | Nativo: `emailAndPassword.requireEmailVerification: true` + `emailVerification.sendVerificationEmail`. |
| Reset de senha por link | Nativo: `emailAndPassword.sendResetPassword` (gera URL com token de uso único e expiração). |
| Sessões | Cookie httpOnly assinado, gerenciado pela lib — nada de JWT manual. Importante: o cookie de sessão **chega junto no upgrade do WebSocket**, o que resolve a autenticação do jogo (ver §4). |
| Segurança | Hash de senha (scrypt), proteção CSRF, tokens de verificação/reset com expiração — mantido pela lib, não por nós. |

Alternativas descartadas:
- **Fazer na mão** (bcrypt + tabela de sessões): mais código nosso para errar (tokens, expiração, CSRF, timing attacks).
- **Firebase Auth / Supabase Auth**: gratuitos, mas acoplam o projeto a um SaaS e a SDKs de cliente pesados; o projeto é deliberadamente vanilla.
- **Lucia**: foi descontinuada (virou guia, não lib).

### 1.2 Banco de dados: **Turso (libSQL/SQLite gerenciado)** ✅ decidido

O deploy é Cloud Run → disco efêmero → **SQLite em arquivo local não serve para produção** (os dados somem a cada deploy/restart de instância). Precisa ser um banco gerenciado.

| Opção | Tier gratuito | Integração com Better Auth | Observações |
|---|---|---|---|
| **Turso** (libSQL/SQLite) | ~5 GB; cobrança por leitura/escrita de linhas (centenas de milhões/mês); **sem teto de horas e sem cold start** | Via dialect Kysely (`@libsql/kysely-libsql`) — oficialmente suportado (qualquer dialect Kysely funciona, incluindo migrations pela CLI), porém caminho menos documentado | **Escolhido.** O modelo de cobrança por requisição casa com o padrão do jogo (poucas queries, espalhadas o dia todo). |
| Neon (Postgres) | 0.5 GB, **~190 h de compute/mês**, autosuspend após ~5 min idle | Primeira classe: `database: new Pool()` com `pg` | Caminho mais documentado da lib, mas com tráfego constante o banco fica acordado quase 24/7 e as 190 h/mês viram o gargalo; além do cold start (~0.5–1 s) no primeiro acesso após idle. |
| Supabase (Postgres) | 0.5 GB | Connection string `pg` | Free tier pausa o projeto após ~1 semana sem uso (reativação manual). |

Decisão (revisão de 2026-08-03): **Turso**. A vantagem do Neon (integração mais documentada) se resume a ~3 linhas de configuração a mais no Turso; já o formato do free tier do Turso é estruturalmente melhor para um jogo com tráfego contínuo e baixo volume de queries. Plano B se `@better-auth/cli migrate` engasgar com libsql: `cli generate` + aplicar o SQL via CLI do Turso.

Para **desenvolvimento local**: banco Turso separado de dev, ou arquivo SQLite local com `better-sqlite3` (mesma engine/dialeto SQL — o Better Auth aceita os dois).

Novas dependências de runtime: `better-auth`, `@libsql/client`, `@libsql/kysely-libsql`, `nodemailer`. (Hoje a única é `ws` — mudança de filosofia já aprovada na revisão.)

### 1.3 Envio de e-mail: **SMTP do Gmail** ✅ decidido

Necessário para verificação de e-mail e reset de senha.

| Opção | Custo | Ressalva |
|---|---|---|
| **SMTP do Gmail** (via `nodemailer` + senha de app) | Zero, ~500 e-mails/dia | E-mails saem de um Gmail pessoal; limite por conta; se o volume crescer, o Google pode travar a conta. |
| Resend | Grátis (3.000/mês), mas exige **domínio próprio verificado** (~R$ 40/ano) | Sem domínio, só entrega para o e-mail do dono da conta (modo teste). |
| Brevo (remetente único) | Zero, 300/dia | Sem domínio a entregabilidade é ruim — risco alto de cair em spam. |

Decisão (revisão de 2026-08-03): **SMTP do Gmail**, priorizando custo zero. Requisitos: conta Gmail dedicada ao jogo (não a pessoal do dev) com verificação em duas etapas ativada, para gerar uma **senha de app**.

Caminho de migração já previsto: todo o envio fica isolado em `src/server/email.js` — quando houver domínio próprio, trocar para Resend é mexer só nesse arquivo, sem tocar na configuração do Better Auth.

### 1.4 Convidados: **sem conta, fluxo atual mantido** ✅ recomendado

Duas opções:

1. **Simples (recomendada):** convidado joga exatamente como hoje (digita nickname e entra). Nenhuma linha de auth no caminho dele; partidas de convidado não geram histórico.
2. Plugin `anonymous` do Better Auth: cria conta fantasma que pode ser "promovida" depois. Mais complexo, cria lixo no banco; só vale se quisermos futuramente migrar histórico de convidado → conta. Não recomendo agora.

---

## 2. Modelo de dados

Better Auth gera e gerencia as próprias tabelas via CLI (`npx @better-auth/cli migrate`):

- `user` (id, name, email, emailVerified, ...) — `name` = **nome do jogador**.
- `session`, `account`, `verification` — internas da lib.

Tabela nossa, fora do Better Auth:

```sql
-- dialeto SQLite (Turso/libSQL)
CREATE TABLE match_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  opponent_name TEXT NOT NULL,          -- nickname do oponente (pode ser convidado)
  opponent_user_id TEXT,                -- NULL se oponente era convidado
  player_class TEXT NOT NULL,           -- atirador | mago | tank
  opponent_class TEXT NOT NULL,
  result       TEXT NOT NULL,           -- 'win' | 'loss' | 'draw'
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))  -- ISO 8601 UTC
);
CREATE INDEX idx_match_history_user ON match_history(user_id, created_at DESC);
```

Notas pensando no ranking futuro:
- Uma linha **por jogador logado** por partida (partida entre dois logados gera duas linhas). Simples de consultar por usuário; o ranking agrega `COUNT(result = 'win')` etc.
- **Decidido:** partidas contra bot ficam **fora** do histórico. `Match.js` só grava quando `match.bot !== true` (isso já exclui tanto o modo offline — que nem passa pelo servidor — quanto o fallback de matchmaking contra bot). Por isso o schema não precisa de coluna `vs_bot`.

---

## 3. Servidor

### 3.1 Novos arquivos

- `src/server/auth.js` — instância `betterAuth({...})`: `database: { dialect: new LibsqlDialect(...), type: 'sqlite' }`, `emailAndPassword` (com `requireEmailVerification` e `sendResetPassword`), `emailVerification.sendVerificationEmail`, `trustedOrigins`.
- `src/server/email.js` — wrapper de envio via `nodemailer` (SMTP do Gmail). Único arquivo que conhece o provedor de e-mail — é o ponto de troca futura para Resend/domínio próprio.
- `src/server/db.js` — client `@libsql/client` compartilhado (auth + histórico).
- `src/server/matchHistory.js` — `saveMatchResult(...)` e `getHistory(userId)`.

### 3.2 Mudanças em arquivos existentes

- `httpServer.js`:
  - Rotear `/api/auth/*` → `toNodeHandler(auth)` **antes** do static file serving.
  - Novo endpoint `GET /api/me/matches` (histórico do usuário logado; valida sessão via `auth.api.getSession({ headers })`).
- `wsServer.js` (ver §4): resolver sessão no handshake.
- `Match.js` / `matchmaking.js`: ao fim da partida (`gameover`), se `match.bot !== true`, chamar `saveMatchResult` para cada lado que tiver `userId`.

### 3.3 Variáveis de ambiente

| Variável | Uso |
|---|---|
| `TURSO_DATABASE_URL` | URL do banco Turso (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Token de acesso do banco |
| `BETTER_AUTH_SECRET` | Assinatura de sessão/tokens |
| `BETTER_AUTH_URL` | URL pública (Cloud Run) — base dos links de e-mail |
| `GMAIL_USER` | Endereço Gmail remetente (conta dedicada do jogo) |
| `GMAIL_APP_PASSWORD` | Senha de app do Gmail (requer 2FA na conta) |
| `TURNSTILE_SECRET_KEY` | Secret key do Cloudflare Turnstile — habilita o plugin `captcha` do Better Auth (cadastro, login e pedido de reset). Sem ela definida o plugin nem é montado, e o captcha fica desativado. |

Local: arquivo `.env` (Node 20 suporta `--env-file`, sem dependência nova). Produção: secrets configurados no próprio serviço do Cloud Run (Secret Manager), não no pipeline de deploy.

### 3.4 Captcha: Cloudflare Turnstile

Gratuito, sem limite de requisições. Protege `sign-up/email`, `sign-in/email` e
`request-password-reset` (endpoints padrão do plugin `captcha` do Better Auth,
ver `src/server/auth.js`).

- Site key (pública) fica hardcoded em `public/js/config.js`
  (`TURNSTILE_SITE_KEY`) — não há build step para injetar env vars no client.
- Secret key (privada) fica em `TURNSTILE_SECRET_KEY` no servidor.
- As duas chaves são criadas juntas no [dashboard do Cloudflare](https://dash.cloudflare.com/?to=/:account/turnstile),
  associadas ao(s) domínio(s) do front (Vercel + `localhost` para dev).
- Cliente: widget renderizado em `#authTurnstile` (`public/js/authScreens.js`),
  token enviado no header `x-captcha-response` (`public/js/auth.js`).
- **Sem as duas chaves configuradas (site key real + `TURNSTILE_SECRET_KEY`),
  o captcha fica todo desativado** — nem o servidor exige o header nem o
  widget tem uma site key válida para renderizar de verdade. As duas
  precisam ser trocadas juntas.

---

## 4. Autenticação no WebSocket (vínculo conta ↔ partida)

Hoje o `wsServer.js` lê `nickname`/`classId` da query string. Plano:

> Atualizado após a fase 1: como front e backend estão em domínios diferentes,
> a sessão usa **bearer token**, não cookie. O cliente manda o token na query
> string do WebSocket (o browser não permite headers customizados em `new
> WebSocket`).

1. No `connection`, ler `token` da query string (junto de `classId`).
2. Chamar `auth.api.getSession({ headers: { authorization: \`Bearer ${token}\` } })`:
   - **Sessão válida** → `ws.userId = session.user.id`, e o **nickname passa a ser `session.user.name`** (ignora o da query — impede personificação de jogador registrado).
   - **Sem sessão** → convidado: comportamento atual (nickname da query), `ws.userId = null`.
3. `Match.js` carrega `userId` de cada jogador; no `gameover`, grava o histórico de quem tem `userId`.

Sem mudança de protocolo WS — só o handshake fica mais esperto.

---

## 5. Cliente (`public/`)

**Restrição importante:** não há bundler, então não dá para usar o client oficial do Better Auth (`createAuthClient`). Solução: os endpoints do Better Auth são REST + cookies — usamos `fetch` direto:

- `POST /api/auth/sign-up/email` `{ name, email, password }`
- `POST /api/auth/sign-in/email` `{ email, password }`
- `POST /api/auth/sign-out`
- `GET  /api/auth/get-session`
- `POST /api/auth/request-password-reset` `{ email, redirectTo: '/reset-password.html' }`
- `POST /api/auth/reset-password` `{ newPassword, token }`

Novos módulos/telas (seguindo o padrão atual de um módulo por responsabilidade, em português):

- `public/js/auth.js` — wrapper `fetch` dos endpoints acima + cache da sessão em `state.js`.
- `public/js/authScreens.js` — telas de login / cadastro / "verifique seu e-mail" / "esqueci minha senha", integradas ao fluxo do `menu.js`.
- `public/reset-password.html` + `public/js/resetPassword.js` — página que o link do e-mail abre (lê `?token=` da URL e chama `reset-password`).
- `public/js/profile.js` — tela simples de perfil: nome, botão sair, histórico de partidas (consome `GET /api/me/matches`).
- Ajustes em `menu.js` / `nickname.js`: no menu, três estados — **logado** (mostra nome da conta, campo de nickname escondido), **deslogado** (botões "Entrar / Criar conta" + "Jogar como convidado"), convidado mantém o fluxo atual.

UX do cadastro: após criar conta → tela "enviamos um link para seu e-mail" → login só funciona depois de verificar (`requireEmailVerification` já bloqueia e reenvia o link no sign-in, com `sendOnSignIn: true`).

---

## 6. Testes

- `test/matchHistory.test.js` — montagem do registro de partida (resultado, vs_bot, lados) como função pura, sem banco.
- `test/wsAuth.test.js` — regra de resolução de identidade no handshake (sessão > query string) com `getSession` injetado/fake.
- Fluxos completos do Better Auth (sign-up, verificação, reset) **não** entram na suíte `node --test` (dependem de banco e e-mail) — validação manual num checklist de QA antes do deploy.
- Atenção: `npm test` roda no Cloud Build **sem** rede/banco — todos os testes novos precisam continuar puros/offline.

---

## 7. Fases de entrega (cada uma deployável)

| Fase | Entrega | Depende de |
|---|---|---|
| **1. Fundação** | Banco Turso provisionado, `better-auth` + `@libsql/client` + `@libsql/kysely-libsql` instalados, `auth.js` montado no `httpServer`, migrations rodadas, secrets no Cloud Run. Sign-up/sign-in funcionando via REST (sem UI, testável por curl). | Decisões §1 aprovadas |
| **2. E-mails** | SMTP do Gmail integrado via `nodemailer`: verificação obrigatória + reset de senha ponta a ponta (com `reset-password.html`). | Conta Gmail dedicada com senha de app |
| **3. UI de conta** | Telas de login/cadastro/esqueci-senha no menu; estado logado/deslogado/convidado; sair. | Fase 1–2 |
| **4. Identidade no jogo** | Handshake WS lê sessão; nickname vem da conta quando logado; convidado inalterado. | Fase 1 |
| **5. Histórico** | Tabela `match_history`, gravação no fim da partida online, `GET /api/me/matches`, tela de histórico no perfil. | Fase 4 |
| **6. (Futuro) Ranking** | Fora de escopo agora — o schema da fase 5 já foi desenhado para suportar. | Fase 5 |

---

## 8. Riscos e pontos de atenção

1. **E-mail via Gmail** — resolvido com SMTP do Gmail (custo zero). Atenções: usar conta dedicada (não a pessoal), ~500 envios/dia de limite, e alguns e-mails podem cair em spam (avisar o usuário na tela "verifique seu e-mail" para olhar a caixa de spam). Se o jogo crescer, migrar para domínio próprio + Resend (só `email.js` muda).
2. **Cold start / conexões** — Cloud Run escala a zero, mas o Turso é acessado via HTTP (`@libsql/client`), sem pool de conexões persistente para gerenciar e sem banco "dormindo" — nada a fazer aqui além de reusar o client.
3. **Partida em memória vs. banco** — o jogo continua 100 % em memória; o banco só é tocado em login e fim de partida. Nenhuma query no game loop (60 Hz).
4. **`trustedOrigins`/cookies** — configurar com a URL do Cloud Run (e `localhost:3000` em dev), senão o CSRF check do Better Auth bloqueia o front.
5. **Nome do jogador único** — ✅ decidido: `user.name` é único. Implementação: índice único no banco (case-insensitive, `LOWER(name)`) + validação amigável no sign-up via hook do Better Auth (o índice é a garantia real; o hook dá a mensagem de erro boa).
6. **Escopo do cliente vanilla** — sem o SDK do Better Auth no browser, qualquer feature futura de auth (OAuth social, 2FA) será via REST manual. Aceitável para o escopo atual.

---

## 9. Perguntas em aberto

Nenhuma — todas as decisões foram tomadas.

~~1. Domínio para e-mails?~~ → decidido: **SMTP do Gmail** por enquanto (custo zero, sem domínio); migração futura para domínio + Resend isolada em `email.js`.
~~2. Neon ou Turso?~~ → decidido: **Turso** (comparação completa em §1.2).
~~3. Partidas contra bot no histórico?~~ → decidido: ficam de fora.
~~4. Nome de jogador único?~~ → decidido: sim, único.
~~5. Adicionar as dependências?~~ → decidido: aprovado (`better-auth`, `@libsql/client`, `@libsql/kysely-libsql`).
