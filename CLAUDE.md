# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Sobre o projeto

"Arena PVP" é um jogo 1x1 online 2D (top-down shooter) em vanilla JS, sem framework
e sem bundler. O servidor roda em Node puro (`http` + `ws`), o cliente é HTML/CSS/JS
servido como arquivos estáticos, e há um modo offline contra bot que reusa a mesma
lógica de simulação do servidor.

## Comandos

```bash
npm install       # instala dependências (única dependência de runtime: ws)
npm start         # roda o servidor em src/server/index.js (porta 3000, ou $PORT)
npm test          # roda toda a suíte com o runner nativo node --test
node --test test/Match.test.js          # roda um arquivo de teste específico
node --test --test-name-pattern="foo"   # roda testes que casam com um padrão de nome
npm run db:seed   # popula o banco LOCAL com jogadores/partidas de mock
```

Não há linter, bundler ou etapa de build configurados. Não há transpilação: o código
roda como ES modules nativos tanto no browser (`<script type="module">`) quanto no
Node (`"type": "module"` no package.json).

## Arquitetura

### Três "consumidores" do código em `shared/`

O diretório `shared/` é a fonte única de verdade das regras do jogo (física, classes,
dificuldades de bot, criação de entidades) e é usado por três lugares diferentes:

1. **Servidor** (`src/server/`) — autoritativo para partidas online 1x1.
2. **Cliente em modo bot** (`public/js/bot.js`) — roda a mesma simulação localmente
   no navegador quando o jogador enfrenta um bot, sem round-trip de rede.
3. **Cliente em modo online** (`public/js/prediction.js`) — usa a simulação para
   client-side prediction/reconciliation do próprio jogador entre snapshots do servidor.

Qualquer mudança em regra de jogo (dano, velocidade, colisão, alcance, etc.) deve ser
feita em `shared/` para que os três consumidores continuem consistentes. Nunca duplique
essa lógica em `src/server/` ou `public/js/`.

Como `shared/` é importado tanto por Node quanto por `<script type="module">` no
browser, `src/server/httpServer.js` serve esse diretório como arquivos estáticos sob
a rota `/shared/*` (ver `resolveRequestPath`) — os imports no client-side JS usam
caminhos relativos como `../../shared/constants.js`.

Arquivos principais de `shared/`:
- `constants.js` — dimensões de arena, tamanhos, velocidades, TICK_MS, etc.
- `classes.js` — as três classes jogáveis (atirador, mago, tank) com seus stats
  (dano, cooldown, alcance, escudo, ícone SVG). Fonte única para servidor, bot e menu.
- `botDifficulty.js` — perfis de dificuldade do bot (noob/intermediário/demoníaco):
  mira, tempo de reação, chance de desviar/escudar. Chances de desviar/escudar são
  decididas uma única vez por projétil-ameaça, não a cada tick.
- `physics.js` — colisões (retângulos, escudo circular), clamp, delta de movimento.
- `simulation.js` — `stepPlayers`/`stepProjectiles`: um tick de simulação completo
  (movimento + colisão + dano). É literalmente a mesma função chamada a 60hz pelo
  servidor e pelo loop do bot no cliente.
- `entities.js` — criação de estado de jogador e projéteis (incluindo leque de
  projéteis do mago via `coneSpreadDeg`).
- `matchTimer.js` — tempo regulamentar da partida e desempate por morte súbita
  (ver "Tempo de partida e desempate" abaixo).

### Servidor (`src/server/`)

- `index.js` — bootstrap: cria o HTTP server e anexa o WS server.
- `httpServer.js` — serve arquivos estáticos de `public/` e `shared/`, e expõe
  `GET /api/online-count`.
- `wsServer.js` — handshake de conexão (lê `nickname`/`classId` da query string) e
  roteamento de mensagens (`input`, `shoot`, `leaveQueue`) para o jogador/partida
  daquele socket (`ws.player`, `ws.match`).
- `matchmaking.js` — fila de espera de no máximo 1 jogador (escopo é 1x1 simples).
  Se ninguém entrar na fila em `BOT_MATCH_DELAY_MS` (5s), o jogador cai numa partida
  contra um "bot opponent" fake (objeto com `send()` no-op) em vez de ficar esperando
  — ver `createBotOpponent`/`startBotMatch`.
- `Match.js` — dona do game loop autoritativo por partida: `setInterval` a `TICK_MS`
  chamando `stepPlayers`/`stepProjectiles` de `shared/simulation.js`, e faz broadcast
  do estado (`type: 'state'`) para os dois sockets a cada tick.
- `botAI.js` — IA usada quando `match.bot === true` (oponente sem jogador humano
  real), aplicada dentro do tick de `Match.js` antes de `stepPlayers`.

### Autenticação e contas (`src/server/auth.js`, `db.js`, `email.js`, `schema.js`)

Contas são opcionais: quem não faz login joga como **convidado**, exatamente
como antes (nickname digitado no menu). O planejamento completo está em
`PLANEJAMENTO_AUTH.md`.

- `auth.js` — instância do **Better Auth** (e-mail/senha, verificação de e-mail
  obrigatória, reset de senha por link). Montado em `/api/auth/*` pelo
  `httpServer.js` via `toNodeHandler`.
- `db.js` — client libSQL compartilhado. Em produção aponta para o **Turso**
  (`libsql://`), em desenvolvimento para um arquivo local (`file:./data/local.db`).
  Mesmo driver e mesmo dialeto SQL nos dois casos.
- `email.js` — **único** arquivo que conhece o provedor de e-mail (hoje a API
  HTTP da Brevo, via `BREVO_API_KEY`/`BREVO_SENDER_EMAIL`; não exige domínio
  próprio, só um e-mail remetente verificado em app.brevo.com/senders). Trocar
  de provedor deve mexer só aqui.
- `schema.js` — schema que **não** é do Better Auth: índice único de nome de
  jogador e tabela `match_history`. Idempotente.
- `wsIdentity.js` — quem é o jogador do socket. Com sessão válida o nome vem da
  conta e o `nickname` da query string é ignorado; sem sessão, convidado.
  Recebe `getSession` injetado, então é testável sem banco.
- `matchHistory.js` — histórico das contas. `buildMatchHistoryRows` é pura
  (testada); `saveMatchResult` é chamada no `endMatch` e nunca pode atrapalhar
  o fim da partida. `getHistory`/`getSummary` recebem um `userId` e servem tanto
  o perfil próprio (`/api/me/matches`, autenticado) quanto o perfil público de
  outra conta (`/api/player/matches?name=...`, resolvido por
  `findUserIdByName`). Nas duas rotas o id nunca vem do cliente: no perfil
  próprio vem da sessão, no público vem do nome.
  As duas rotas são **paginadas** por `limit`/`offset` (`parsePaginacao`, pura e
  testada: padrão 20, teto de 50, valor inválido cai no padrão) e devolvem
  `{ matches, hasMore, summary }`. `getHistory` pede uma linha além do limite
  para calcular `hasMore` sem um `COUNT(*)` extra, e `summary` só vem na
  primeira página (`offset === 0`) — nas seguintes é `null`, porque o resumo já
  está na tela e não muda com o scroll.
- `ranking.js` — ranking global por vitórias (`GET /api/ranking`, público).
- `scripts/seed-mock.mjs` (`npm run db:seed`) — contas e partidas de mock para
  ter o que olhar no ranking e nos perfis em desenvolvimento. Aborta se o banco
  for remoto (Turso), é idempotente (apaga o mock anterior pelo prefixo `mock-`
  no id) e não cria linha em `account`, então as contas de mock não fazem login.
  Gera round-robin repetido entre os jogadores de mock (~26 partidas por
  perfil), algumas contra convidado (`player2_id` nulo) e também partidas das
  contas reais do banco local contra os mocks, para o perfil de quem faz login
  em dev não ficar vazio. Toda partida gerada tem ao menos um lado de mock —
  é isso que garante que a limpeza pelo prefixo desfaça o seed por completo.

Pontos de atenção:

- **Front e backend ficam em domínios diferentes** (Vercel × Cloud Run), então o
  cookie de sessão seria um cookie de terceiros e é bloqueado por padrão em
  vários navegadores. Por isso a sessão usa o plugin **`bearer`**: o cliente
  guarda o token devolvido no header `set-auth-token` e o envia em
  `Authorization: Bearer`. Não introduza fluxos que dependam de cookie cross-site.
- O nome da conta **é** o nome exibido em partida e é único (ignorando
  maiúsculas). A garantia real é o índice `idx_user_name_unico`; o hook em
  `auth.js` existe só para a mensagem de erro amigável. Ambos usam as regras de
  `shared/nickname.js`.
- Nome de **conta** é mais restrito que nickname de convidado: só letras sem
  acento e números (`isValidAccountName`/`ACCOUNT_NAME_PATTERN` em
  `shared/nickname.js`) — sem espaço, acento, pontuação ou emoji, para não
  existirem dois nomes visualmente iguais no ranking/perfil. A regra é aplicada
  em três camadas: o campo `#authName` descarta caractere proibido enquanto o
  jogador digita ou cola (`filtrarNomeDigitado` em `authScreens.js`, usando
  `filterAccountNameChars` e preservando a posição do cursor), o envio do
  formulário é barrado antes de gastar o token do captcha, e o hook `before` de
  criação de usuário em `auth.js`, que é o que
  realmente vale — a rota de cadastro pode ser chamada direto. Nickname de
  convidado (`isValidNickname`) segue aceitando qualquer caractere.
- O token de sessão é base64 e contém `+`, `/` e `=`. Em query string um `+`
  cru vira **espaço** e corrompe o token silenciosamente (o jogador vira
  convidado, sem erro). Monte a URL do WebSocket sempre com `URLSearchParams`.
- Só partidas online entre jogadores com conta geram histórico: convidados e
  partidas contra bot ficam de fora.
- Migrations: `npm run db:migrate` (roda a CLI do Better Auth e depois o schema
  da aplicação). Credenciais ficam no `.env` local (ignorado pelo git) e em
  secrets no Cloud Run.

### Cliente (`public/js/`)

Sem componentes/framework: cada arquivo é um módulo com responsabilidade única,
importado por `main.js`, que é o entrypoint (registrado em `index.html`) e apenas
conecta event listeners de UI aos módulos.

- `state.js` — estado global mutável do cliente (single source of truth do lado
  cliente): modo atual (`online`/`bot`), input, snapshot mais recente do servidor,
  estado do bot local, etc.
- `network.js` — conexão WebSocket do modo online: envia `input`/`shoot`, e trata
  mensagens do servidor (`waiting`, `init`, `start`, `state`, `gameover`).
- `bot.js` — modo offline contra bot: mantém seu próprio loop (`setInterval` a
  `TICK_MS`) chamando as mesmas `stepPlayers`/`stepProjectiles` de `shared/`, e roda
  a IA do bot no cliente (mira preditiva opcional, desvio, escudo — mesmas regras
  de decisão-por-projétil do lado servidor).
- `prediction.js` — client-side prediction/reconciliation: no modo online, o
  cliente simula seu próprio jogador localmente a cada frame com `shared/simulation.js`
  e reconcilia com o snapshot autoritativo do servidor quando ele chega.
- `render.js` — loop de `requestAnimationFrame` que desenha o estado atual no canvas.
- `input.js` — captura teclado/mouse e atualiza `state.input`.
- `menu.js` — transições entre tela de menu e tela de jogo, e start/stop dos dois modos.
- `classSelect.js` / `botClassSelect.js` — seleção de classe (própria e, no modo bot,
  também a do oponente).
- `ranking.js` / `profile.js` — ranking do menu (posição, nome e vitórias, com
  poll a cada 30s) e modal de histórico de partidas. Clicar no nome de um
  jogador do ranking abre o perfil **dele** (`abrirPerfilDeJogador`, rota
  pública, sem token); o botão "Perfil" da barra de conta abre o próprio
  (rota autenticada). O clique usa delegação no `<ol>`, porque a lista é
  reescrita inteira a cada poll. A lista de partidas é **infinite scroll**: abre
  com as últimas 20 e pede a próxima página quando o scroll do `#profileBody`
  chega perto do fim (`hasMore` da rota diz se ainda há mais). Cada abertura de
  perfil tem um id (`aberturaAtual`) para descartar respostas atrasadas de um
  perfil já fechado ou de outro jogador, e `garantirListaRolavel` puxa mais
  quando a lista ainda não é alta o bastante para gerar scroll. O modal também
  mostra as **3 classes mais usadas nas últimas 20 partidas**, derivadas no
  cliente da **primeira página** do histórico (não muda conforme o scroll
  carrega partidas mais antigas) — a conta fica em
  `profileStats.js`, que é puro e testado (`test/profileStats.test.js`), sem
  DOM nem rede.
- `overlays.js`, `gameOver.js`, `hud.js` — overlays de espera/contagem regressiva/fim
  de jogo e HUD (vidas, cooldown, escudo).
- `tutorial/matchTutorial.js` — único tutorial do jogo (o antigo modal explicativo
  "Como jogar" em canvas foi removido): joga-se uma partida de verdade contra o
  bot enquanto uma faixa no topo da arena (`#matchTutorialBanner`) indica a
  próxima ação (mover, atirar, escudar), avançando para o próximo passo quando
  `notifyMatchTutorial` é chamado com a ação correspondente — disparado de
  `input.js` a cada tecla de movimento, clique de tiro e ativação de escudo.
  Ao completar um passo o balão fica verde e toca `playTutorialStepSound()`
  (`audio.js`). Enquanto o tutorial está ativo (`isMatchTutorialActive()`), o
  bot não atira (`bot.js`), para o jogador poder praticar sem risco.
  - Controlado por uma flag em `localStorage` (`jogoDoAno.tutorialPartidaVisto`):
    roda sozinho só uma vez por navegador, na primeira partida contra bot **ou**
    online — `startOnline` (`menu.js`) redireciona a primeira partida online do
    jogador para uma partida de bot com tutorial em vez de matchmaking real,
    porque um oponente online de verdade não pode ser impedido de atirar.
    `startMatchTutorial()` é chamado quando a partida realmente começa (`bot.js`,
    no fim da contagem regressiva), e `stopMatchTutorial()` ao voltar ao menu ou
    preparar uma nova partida (`menu.js`) e ao fim de uma partida (`gameOver.js`).
  - O botão "Como jogar" do menu (`main.js`) chama `forceNextMatchTutorial()` e
    inicia uma partida de bot, reabrindo o tutorial mesmo que já tenha sido
    visto antes.

#### Efeitos sonoros (`public/js/audio.js`)

Todo o som do jogo é **sintetizado na hora** com a Web Audio API — não existe
nenhum arquivo de áudio no projeto, e não deve passar a existir sem uma boa
razão. `audio.js` é só a camada de síntese: helpers privados (`nota`, `ruido`,
`sequencia`, `envelope`) e uma função exportada por efeito (`playHitSound`,
`playExplosionSound`, …). Quem decide *quando* tocar é o módulo que já conhece o
evento.

- **Um único `AudioContext`** para todo o jogo, criado no primeiro efeito e
  nunca fechado. Um contexto por som (como era antes) estoura o limite do
  navegador (~6 ativos) assim que os sons de combate entram.
- Enquanto o navegador não liberou o áudio (antes do primeiro gesto do
  usuário), `ctx()` devolve `null` e o efeito é **descartado**, não agendado —
  num contexto suspenso o tempo não corre e tudo tocaria de uma vez quando ele
  fosse liberado.
- Cada efeito tem uma **janela anti-repetição** própria (`efeito(id, janelaMs,
  …)`): dois eventos podem cair no mesmo tick (os dois jogadores perdendo um
  coração no desempate, os 3 projéteis do mago no escudo) e o mesmo som
  sobreposto satura o áudio. É também o que segura o som de "ação
  indisponível" enquanto a tecla fica pressionada (keydown repete).
- Falha de áudio nunca pode atrapalhar a partida: todo efeito roda dentro de um
  `try/catch` silencioso.

Dano e bloqueio **não** são detectados pelo input local — senão o jogador não
ouviria nada do que o oponente faz, e o modo online não teria como saber. Os dois
saem da comparação de snapshots dentro do HUD (`hud.js`): `updateHeartsRow` toca
o som de dano quando as vidas caem, e `updateShieldsRow` compara as cargas de
escudo com as do tick anterior (`prevShieldCharges`) — perdeu carga = bloqueou,
e se era a última o som é o de escudo quebrando. Isso vale de graça para os dois
modos, porque `updateHud` é chamado tanto por `network.js` (mensagem `state`)
quanto por `bot.js` (`publicarEstadoBot`), e também para o dreno de corações do
desempate, que é justamente vida caindo.

Outros pontos de disparo: `explosions.js` (explosão, no mesmo lugar que dispara
as partículas), `gameOver.js` (vitória/derrota — no **overlay**, não em
`recordGameOver`, para o jingle não competir com a explosão; empate usa o som de
derrota), `matchTimer.js` (tique dos últimos 10s, um por segundo, e buzina do
desempate), `input.js` (escudo erguido e ação indisponível), `nearMiss.js`
(projétil que passou raspando, detectado por frame pela distância mínima, já que
os projéteis do snapshot não têm id) e `uiSounds.js` (hover/clique, delegados no
`document` — tudo clicável no jogo é um `<button>`).

Ainda não têm som: os **tiros** (um timbre por classe) e os efeitos de
ambiente. Falta também expor **volume/mudo** na interface — o `GainNode` master
já está no lugar, só não há controle nem preferência salva.

#### Loading skeleton na tela inicial

Qualquer elemento da tela de menu que depende de uma resposta assíncrona antes de
mostrar conteúdo real (barra de conta aguardando `loadSession()`, contagem de
jogadores online, ranking) começa com um estado de loading em vez de aparecer vazio
ou pular direto para um valor "adivinhado" (ex.: assumir convidado antes da sessão
responder). Use sempre o padrão de **loading skeleton** já definido em
`public/css/style.css` (classes `.skeleton-loading` e `.skeleton-row`, com a
animação `skeleton-shimmer`), e troque só a classe/conteúdo via JS quando a resposta
chegar — a estrutura HTML dos elementos não muda entre o estado de loading e o
estado carregado. Exemplos existentes: `#accountBar` (`.skeleton-loading` até
`atualizarBarraDeConta()` rodar em `authScreens.js`), `#onlineCount`
(`onlineCount.js`) e os `<li class="skeleton-row">` de `#rankingList` (substituídos
pelo conteúdo real assim que `ranking.js` recebe a primeira resposta).

### Espelhamento de visão (jogador sempre à esquerda)

O jogador local sempre vê a si mesmo do lado esquerdo da tela, mesmo quando a posição
inicial dele na arena (mundo) é do lado direito. Isso é puramente visual: a física e as
posições reais em `shared/` nunca são espelhadas, só a renderização e a interpretação
do input/mouse do jogador local.

- `state.viewFlipped` (`public/js/state.js`) é decidido **uma única vez**, no início da
  partida (`network.js` no `case 'init'`, ou `bot.js` em `startBot`), comparando a
  posição X inicial do jogador local com a do oponente via `computeInitialViewFlip`.
  Ele **não** é recalculado a cada frame — se fosse, a tela inverteria toda vez que os
  jogadores se cruzassem em X durante a partida, o que é muito confuso para quem está
  jogando.
- `render.js` aplica `ctx.translate`/`ctx.scale(-1, 1)` em volta de todo o desenho do
  mundo (jogadores, projéteis, escudo, explosões, prévia de mira) quando `viewFlipped`
  é `true`. HUD (nomes, vidas, cooldown) fica fora do canvas e nunca é afetado — o slot
  "P0" do HUD é sempre o jogador local, independente do `playerIndex` real.
- `screenXToWorld` (`state.js`) desfaz o espelhamento para converter posição de
  tela/mouse em coordenada de mundo — usado na prévia de mira e no clique de tiro
  (`input.js`), já que o alvo do tiro precisa ser enviado em coordenadas de mundo.
- `getWorldInput` (`state.js`) troca `left`/`right` do input antes de alimentar a
  física, sempre que `viewFlipped` está ativo. `state.input.left/right` refletem a
  tecla física como o jogador vê na tela (A/D, setas); sem essa troca, quem começa do
  lado direito da arena teria os controles horizontais invertidos. É usado nos três
  lugares que alimentam movimento com o input do jogador local: `prediction.js`
  (predição local, modo online), `network.js` (`sendInput`, o que vai pro servidor) e
  `bot.js` (simulação local do modo bot).
- Testes em `test/state.test.js` cobrem `computeInitialViewFlip`, `screenXToWorld` e
  `getWorldInput`.

### Tempo de partida e desempate

Toda partida dura no máximo `MATCH_DURATION_MS` (2 minutos). A contagem e o
desempate são regra de jogo e vivem em `shared/matchTimer.js`, chamados a cada
tick pelos dois donos de loop: `Match.js` (online) e `bot.js` (modo treino).

- O cronômetro é criado **quando a partida começa de verdade** (no fim da
  contagem regressiva), não em `createMatch`/`startBot`.
- Se alguém vence antes do tempo, o loop para junto com a partida e o relógio
  simplesmente congela no último valor — não existe estado de "pausa".
- `tickCronometro` devolve o que aconteceu no tick
  (`iniciouDesempate`/`drenou`/`fim`/`winnerIndex`) e quem chama decide o que
  fazer; é a única função que mexe nas vidas fora de `simulation.js`.
- Acabando o tempo com os dois vivos, entra o **desempate**: a partida congela
  (`congelarPartida` zera inputs/escudo e descarta os projéteis no ar, para
  ninguém morrer por um tiro disparado antes), e depois de
  `DESEMPATE_DELAY_MS` os dois perdem um coração a cada `DESEMPATE_PASSO_MS`.
  Quem zerar primeiro perde; zerando no mesmo passo, `winnerIndex` é `null` —
  os dois explodem e a partida é empate (`recordGameOver('draw')`, gravado no
  histórico com `winner_index` nulo, que já contava como empate no perfil).
- O congelamento é aplicado nas **duas** pontas: o servidor ignora `input` e
  `shoot` durante o desempate (`wsServer.js`) e o cliente para a predição
  local (`prediction.js`), o tiro e o escudo (`input.js`) — senão o jogador
  veria a si mesmo andando para ser puxado de volta na reconciliação.
- No modo online o cliente não conta o tempo: `remainingMs`/`desempate` vêm em
  cada mensagem `state`. No modo bot vêm do cronômetro local. Nos dois casos
  quem escreve em `state`/HUD é `public/js/matchTimer.js` (`#matchTimer`, no
  centro do HUD, logo acima da arena).
- Enquanto o tutorial interativo roda, o relógio **não corre** (`adiarFim` a
  cada tick em `bot.js`): quem está aprendendo os controles não está disputando
  a partida.

### Convenção de nomes e comentários

O código e os comentários existentes estão em português — siga essa convenção ao
editar ou adicionar código neste repositório.

## Deploy

Front e backend ficam em plataformas diferentes, mas num **único pipeline** no
GitHub Actions (`.github/workflows/deploy.yml`), disparado por push na `main`:

1. `test` — `npm install` + `npm test`. É o gate: falhando, nenhum dos dois
   deploys roda.
2. `deploy-backend` — build da imagem Docker (`Dockerfile`, Node 20 Alpine),
   push para o Artifact Registry e `gcloud run deploy` do serviço `jogo-do-ano`
   (projeto `jogo-do-ano-app`, região `southamerica-east1`). Autentica no GCP
   via Workload Identity Federation (secrets `GCP_WIF_PROVIDER` e
   `GCP_DEPLOY_SA`), sem chave de service account no repo.
3. `deploy-frontend` — `vercel build`/`deploy --prod` da pasta `public/`.

Pontos de atenção:

- A ordem backend → frontend é **proposital** e não deve ser paralelizada: o
  front tem o host do backend hardcoded em `public/js/config.js` e consome
  `/api/*` dele, então subir o front antes arriscaria chamar uma API que ainda
  não existe. Se um deploy falhar, a metade que subiu é a compatível com a
  versão antiga da outra.
- A imagem é taggeada com `:latest` e com o SHA do commit; rollback é
  `gcloud run deploy --image ...:<sha antigo>`.
- Não existe mais `cloudbuild.yaml`, e o trigger do Cloud Build precisa ficar
  **desabilitado** no console GCP — ativo, ele dispararia o deploy do backend
  por fora do gate de teste.
- Mudança em `shared/` ou em contrato de API precisa dos dois deploys; é o
  pipeline único que garante que eles saem do mesmo commit.
