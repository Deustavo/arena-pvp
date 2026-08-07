# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Sobre o projeto

"Demon Arena" é um jogo 1x1 online 2D (top-down shooter) em vanilla JS, sem framework
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
- `botDifficulty.js` — perfis de dificuldade do bot (noob/intermediário/difícil/demoníaco):
  mira, tempo de reação, chance de desviar/escudar. Chances de desviar/escudar são
  decididas uma única vez por projétil-ameaça, não a cada tick.
- `botStrategy.js` — estratégia de posicionamento/ataque por **classe** do bot
  (independente da dificuldade acima): tanque pressiona de perto, mago se mantém a
  meio-alcance para aproveitar o leque de projéteis, duelista e sniper mantêm
  distância (o sniper especificamente recua se o jogador entrar no raio abaixo do
  bônus de dano de longa distância), e o assassino faz hit-and-run — foge por
  `ASSASSINO_RETREAT_MS` depois de cada tiro em vez de ficar parado no alcance do
  troco. Também decide a preferência entre desviar e escudar: classes com só 1 carga
  de escudo (`shieldMaxHits <= 1`) preferem desviar em vez de arriscar a única
  chance de bloqueio. `findIncomingThreat` acha o projétil-ameaça olhando o sinal
  de `vx` do projétil (não a posição relativa ao bot), então funciona nos dois
  lados da arena — o bot detecta e reage a tiros vindo de qualquer direção, não só
  de quando o adversário está à sua esquerda. Fonte única para `src/server/botAI.js`
  e `public/js/bot.js`.
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
  real), aplicada dentro do tick de `Match.js` antes de `stepPlayers`. O
  posicionamento/ataque por classe vem de `shared/botStrategy.js`; este arquivo só
  aplica reflexo/mira/desvio conforme a dificuldade (`shared/botDifficulty.js`) e
  gerencia o cooldown de tiro.

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
  cliente): modo atual (`online`/`bot`/`spectator`), input, snapshot mais
  recente do servidor, estado do bot local, etc.
- `network.js` — conexão WebSocket do modo online: envia `input`/`shoot`, e trata
  mensagens do servidor (`waiting`, `init`, `start`, `state`, `gameover`). Também
  expõe `connectSpectator`, a conexão somente-leitura do modo espectador (ver
  "Modo espectador" abaixo).
- `liveMatches.js` — painel "Partidas ao vivo" do menu (`#spectatorPanel`, abaixo
  dos containers de início): poll de `GET /api/live-matches` a cada 5s, mesmo
  padrão de `onlineCount.js`/`ranking.js`, com um botão "Assistir" por partida.
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
  também a do oponente). A modal do modo online (`onlineClassSelect.js`) é a
  lista vertical de classes de sempre (`#classList`, à esquerda) ao lado do
  preview animado + painel de stats (`#classRight`, empilhados à direita). Só o
  **clique** num cartão da lista troca a classe mostrada — passar o mouse por
  cima não muda nada, senão a modal ficaria trocando de personagem enquanto o
  jogador só passa o mouse a caminho de outro cartão. O modo treino continua
  usando os dropdowns compactos (`dropdown: true`), porque tem duas colunas
  (jogador/bot) lado a lado.
- `classSprite.js` — sprite de personagem desenhado em **DOM** (não no canvas):
  reusa as spritesheets de `characterSprites.js` (via `getSpriteAnimation`) e
  anda os quadros por CSS, com `background-position` em `steps()` sobre a tira
  de quadros. É o que dá o personagem de verdade nos cartões de classe e no
  preview da modal, no lugar do quadrado colorido antigo. O JS só escreve a
  imagem e `--sprite-frames`/`--sprite-duration`; o enquadramento (zoom e
  `--sprite-anchor`, a altura do centro do corpo dentro do quadro 100x100) fica
  em `.class-sprite`, no CSS. Nos cartões da lista o valor é só estético
  (0.4); no preview da modal (`.class-preview-fighter`, `--sprite-anchor:
  0.5`) precisa bater exatamente com a altura em que o tiro sai — usa o centro
  geométrico do quadro, o mesmo ponto (`cy`) que `render.js` usa pra
  centralizar o sprite no canvas e de onde os projéteis realmente saem.
  Assassino/sniper têm uma correção nesse centro no canvas
  (`getSpriteOffsetY`, pose mais agachada/alongada); `classPreview.js` aplica
  a mesma correção escalada pro tamanho do preview via `--sprite-shot-offset`,
  senão o tiro sairia visivelmente acima do personagem só nessas duas
  classes.
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
- `mobileBlock.js` — celular/tablet não tem como jogar (o jogo é WASD + mouse e
  não existe controle de toque), então em aparelho touch-only `main.js` mostra
  só o aviso `#mobileBlock` ("jogue no computador") e **não inicializa mais
  nada** — nem a música, que ficaria tocando por cima da mensagem. A detecção
  (`deveBloquearMobile`, pura e testada) combina client hints, user agent,
  multitoque em `MacIntel` (iPadOS se anuncia como Mac) e, como último recurso,
  `pointer: coarse` sem `hover`. Um notebook com tela sensível ao toque
  continua liberado, porque tem mouse e teclado.
- `tutorial/matchTutorial.js` — único tutorial do jogo (o antigo modal explicativo
  "Como jogar" em canvas foi removido): joga-se uma partida de verdade contra o
  bot enquanto uma faixa no topo da arena (`#matchTutorialBanner`) indica a
  próxima ação (mover, atirar, escudar, pegar power-up), avançando para o
  próximo passo quando
  `notifyMatchTutorial` é chamado com a ação correspondente — disparado de
  `input.js` a cada tecla de movimento, clique de tiro e ativação de escudo, e
  de `bot.js` na coleta do power-up (essa é a única ação do tutorial que não sai
  do input local: quem detecta é o dono do loop, pelo evento `coletados` de
  `tickPowerups`).
  Ao completar um passo o balão fica verde e toca `playTutorialStepSound()`
  (`audio.js`). A faixa fica na faixa de cima da arena mas afastada da borda
  (`top: 24%`) e com fonte grande — não no centro exato, porque os dois
  jogadores nascem na metade vertical e ficariam cobertos.
  Enquanto o tutorial está ativo (`isMatchTutorialActive()`), o oponente é um
  **boneco de treino** (`updateBotAI` em `bot.js` sai antes de toda a IA
  normal): fica parado, não atira e mantém o escudo erguido. E enquanto
  `isMatchTutorialDummyInvulnerable()` (ativo e o passo atual ainda tem ação,
  isto é, até o passo final de "boa sorte") o boneco é indestrutível — o
  jogador não pode encerrar o tutorial matando o oponente antes de passar por
  mover/atirar/escudar/power-up. A invulnerabilidade é aplicada em `botTick` **depois**
  da simulação e antes de publicar o estado (cargas de escudo e vidas
  restauradas, vitória do jogador ignorada no callback): antes da simulação o
  escudo furaria com vários projéteis no mesmo tick (leque do mago, classe com
  uma única carga), e restaurar depois evita que o HUD veja a perda e toque som
  de dano/escudo quebrado.
  - O passo de power-up precisa de uma bolha na arena, mas a agenda normal é em
    tempo restante e o relógio não corre durante o tutorial — então enquanto
    `isMatchTutorialWaitingPowerup()`, `botTick` coloca uma bolha na mão com
    `criarPowerupTutorial` (`shared/powerups.js`): sempre no centro de
    `POWERUP_ZONE` e do tipo **velocidade**, o único efeito que passa sozinho,
    para o tutorial não mudar os corações/cargas de escudo com que o jogador
    entra na partida de verdade. Uma bolha por vez (lista vazia = precisa de
    outra), e `isMatchTutorialWaitingPowerup()` é falso durante o flash verde,
    senão nasceria uma bolha nova no lugar da que acabou de ser pega.
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

Os efeitos do jogo são **sintetizados na hora** com a Web Audio API — o padrão
é não haver arquivo de áudio, e cada exceção precisa de uma boa razão.
`audio.js` é a camada de síntese: helpers privados (`nota`, `ruido`,
`sequencia`, `envelope`) e uma função exportada por efeito (`playHitSound`,
`playExplosionSound`, …). Quem decide *quando* tocar é o módulo que já conhece o
evento.

Hoje há **uma** exceção: a sirene de aviso da erupção
(`playEruptionWarningSound`, `assets/audio/fireballalert.mp3`) — a versão
sintetizada não chegava perto do alerta que o efeito precisa ser. Ela toca pelo
helper `amostra`, que decodifica o arquivo num `AudioBuffer` e o manda pelo
**mesmo `master`** dos efeitos sintetizados; não use `<audio>` para efeito,
senão o volume, o mudo e a liberação de áudio pelo gesto do usuário deixam de
valer para ele. O arquivo é baixado no load da página e decodificado quando o
`AudioContext` nasce (não no primeiro toque, que seria tarde: decodificar é
assíncrono e a primeira ocorrência sairia muda). Música é outra coisa —
`music.js` são faixas mp3 num `<audio>` com bus e controle próprios, fora do
`master` dos efeitos.

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

Tiro, dano e bloqueio **não** são detectados pelo input local — senão o
jogador não ouviria nada do que o oponente faz, e o modo online não teria como
saber. Os três saem da comparação de snapshots dentro do HUD (`hud.js`) contra
o valor do jogador naquele slot no tick anterior:
- `checkShot` toca `playShotSound()` quando `lastShot` mudou — **o mesmo som
  para as 6 classes**, de propósito: é o efeito mais repetido da partida, então
  precisa ser o mais discreto e não vale a pena diferenciar por classe.
- `updateHeartsRow` toca o som de dano quando as vidas caem.
- `updateShieldsRow` compara as cargas de escudo (`prevShieldCharges`) — perdeu
  carga = bloqueou, e se era a última o som é o de escudo quebrando.

Isso vale de graça para os dois jogadores e os dois modos, porque `updateHud`
é chamado tanto por `network.js` (mensagem `state`) quanto por `bot.js`
(`publicarEstadoBot`) — e também cobre o dreno de corações do desempate, que é
justamente vida caindo.

Outros pontos de disparo: `explosions.js` (explosão, no mesmo lugar que dispara
as partículas), `gameOver.js` (vitória/derrota — no **overlay**, não em
`recordGameOver`, para o jingle não competir com a explosão; empate usa o som de
derrota), `matchTimer.js` (tique dos últimos 10s, um por segundo, e buzina do
desempate), `input.js` (escudo erguido e ação indisponível), `nearMiss.js`
(projétil que passou raspando, detectado por frame pela distância mínima, já que
os projéteis do snapshot não têm id), `powerups.js` (bolha que surgiu e power-up
coletado, também por comparação de snapshots) e `uiSounds.js` (hover/clique, delegados no
`document` — tudo clicável no jogo é um `<button>`).

Ainda não têm som os efeitos de ambiente. Falta também expor **volume/mudo**
na interface — o `GainNode` master já está no lugar, só não há controle nem
preferência salva.

#### Pixel art (`public/js/pixel.js`)

Toda a arte do jogo é pixel art, e não só os assets: os personagens
(spritesheets) e as arenas já eram, e **tudo o que é desenhado por código**
— canvas e CSS — segue a mesma estética. Na prática isso significa três
proibições, que valem para qualquer desenho novo:

- **No canvas, nada de forma vetorial.** Sem `arc`, `stroke`, `ellipse`,
  `setLineDash` ou `ctx.font`. Só `fillRect` alinhado a uma grade, pelas
  primitivas de `public/js/pixel.js`: `PX` (o "pixel de arte", 4 unidades de
  canvas), `snap`, `pxCirculo`, `pxAnel`, `pxGrade`,
  `pxTexto`/`pxTextoCentro` (fonte bitmap 3x5, para os números desenhados na
  arena) e `alphaEmDegraus`. O módulo é puro (recebe o contexto por
  parâmetro) e é testado em `test/pixel.test.js`.
- **Nada de posição fracionária.** Posição, raio, espessura, tremida de
  câmera e deslocamento de dano passam por `snap` (ou ao menos
  `Math.round`, no caso dos sprites, que têm resolução própria). Meio pixel
  de deslocamento reamostra o desenho e o borra. Por isso o canvas tem
  `image-rendering: pixelated` no CSS e `imageSmoothingEnabled = false` em
  `dom.js`: `gameScale.js` reduz os 800x600 por um fator quase nunca
  inteiro, e sem isso a arena inteira sai interpolada.
- **Nada de transição contínua.** O que desaparece perde etapas visíveis
  (`alphaEmDegraus`), e pulsação/balanço alternam entre posições e tamanhos
  inteiros em vez de seguir uma senoide. A exceção é o aviso de erupção da
  arena de fogo, que é uma área grande e usa opacidade de verdade (dois
  níveis alternando) — dithering em xadrez ali virava ruído sobre o chão
  texturizado.

O conteúdo da bolha de power-up usa uma grade fina de `PX / 2`: a bolha tem
40px de diâmetro (`POWERUP_RADIUS` é o raio de coleta, não dá para desenhá-la
maior do que ela é) e um ícone de 7 células em blocos de 4px a preencheria
inteira. É a mesma escala dos corações do HUD.

No CSS, painéis e modais seguem o mesmo vocabulário: canto reto e sombra
sólida deslocada (`8px 8px 0`) em vez de desfoque, skeleton de loading em
passos (`steps()`) e barra de cooldown enchendo em blocos.

**Duas exceções deliberadas**, que já foram tentadas em pixel art e
revertidas por deixarem a interface carregada — não "conserte" nenhuma das
duas:

- **Botões** continuam com `border-radius`, sombra suave no hover e
  `transition`/`scale`. A versão em "bloco de pedra" (bisel de 4px,
  espessura e sombra dura em cada botão) punha peso de arte em cima de todo
  elemento clicável. Botão aqui é suporte, não arte.
- **Ícones das seis classes** (`shared/classes.js`) continuam sendo SVG de
  traço fino (`fill: none; stroke: currentColor; stroke-width: 2`). A versão
  em grade 16x16 preenchida ficava pesada e menos legível no tamanho em que
  os ícones aparecem (16–20px no HUD e nos cartões).

#### Paleta de cores (`public/css/style.css`)

Todas as cores da interface ficam em **variáveis CSS no `:root`**, no topo do
`style.css`. Nenhuma regra abaixo desse bloco deve escrever um hex literal — use
uma variável existente ou crie uma nova ali, com nome de propósito
(`--cor-superficie-hover`, `--cor-texto-fraco`, `--cor-vermelho-destaque`…).
Isso vale também para as sombras repetidas (`--sombra-modal`,
`--sombra-flutuante`, `--sombra-foco-vermelho`). Antes existiam vários cinzas
quase iguais (`#2b2b3d`, `#2e2e2e`, `#2f2f40`) e várias cópias da mesma
`box-shadow` aparecendo lado a lado na mesma tela; cores iguais ou
imperceptivelmente diferentes foram unificadas na mesma variável.

Regras de cor do jogo:

- A interface é **escala de cinza + o vermelho da identidade**. Os cinzas não
  têm tom azulado/arroxeado — se um valor novo não for `#rgb` com os três
  canais iguais (ou muito próximos), provavelmente está errado.
- Azul só onde a cor **é informação**, nunca decoração: `--cor-azul-classe`
  (classe no HUD), `--cor-azul-escudo`, `--cor-azul-ranking`, `--cor-azul-link`.
- A cor de cada classe vem de `shared/classes.js` e chega ao CSS pela custom
  property `--class-color`, aplicada no elemento pelo JS (`classSelect.js`,
  `profile.js`). É o único identificador colorido de classe: textos e ícones ao
  redor (título e stats de `#classDetails`, por exemplo) ficam neutros.
- Seleção/foco usam vermelho (`--cor-vermelho-destaque`), não verde — verde é só
  `--cor-sucesso` (vitória, contagem de vitórias).
- Modais são **opacas** (`--cor-modal-fundo`); o véu translúcido que separa a
  modal do menu é o overlay atrás dela, não a modal. Painéis da tela inicial
  (`#rankingPanel`, `#menu`) continuam translúcidos (`--cor-painel-fundo`),
  porque o fundo com paralaxe faz parte do visual da tela inicial.

As cores desenhadas no canvas (`render.js`, `explosions.js`, `fireCursor.js`,
`shared/classes.js`) não passam por essas variáveis — CSS não alcança o canvas.
Lá elas ficam em constantes nomeadas no topo de cada módulo.

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

Toda partida dura no máximo `MATCH_DURATION_MS` (1 minuto). A contagem e o
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

### Power-ups na arena

Quatro bolhas de power-up aparecem por partida, disputadas pelos dois jogadores.
As regras vivem em `shared/powerups.js` (fonte única para servidor, modo treino
e bot), e o desenho/som em `public/js/powerups.js`.

- Quatro tipos: **vida** (1 a 3 corações), **escudo** (1 carga), **cadência**
  (cooldown de tiro pela metade + recarga instantânea, 10s) e **velocidade**
  (+40%, 10s).
- Vida e escudo passam do máximo da classe de propósito: preenchem o que
  falta e aumentam o teto se já estiver cheio. O HUD acompanha —
  `updateHeartsRow`/`updateShieldsRow` (`hud.js`) refazem a fileira quando
  precisam de mais ícones do que a classe tem.
- O agendamento é em **tempo restante** (0:52–0:44, 0:40–0:32, 0:28–0:20 e
  0:16–0:08 — quatro janelas de 8s espaçadas por 4s), não em instante
  absoluto. É isso que faz o
  tutorial interativo funcionar de graça: enquanto o relógio não corre
  (`adiarFim`), o tempo restante fica parado no máximo e nenhuma bolha aparece.
- Tipo, valor, posição (sorteada dentro de `POWERUP_ZONE`, o círculo central
  da arena) e horário são sorteados **uma vez** por `criarPowerups()`, do lado
  autoritativo (`Match.js` no online, `bot.js` no treino). O cliente online só
  desenha `msg.powerups` do snapshot, nunca sorteia nada.
- Os buffs vão no snapshot como **tempo restante** (`buffsRestantes`), não como
  instante de expiração: o relógio do cliente não é o do servidor e o efeito
  visual apagaria na hora errada. Junto vão `speed` e `shotCooldownMs` já
  calculados, para predição (`prediction.js`), barra de cooldown (`hud.js`) e
  som de "ainda não recarregou" (`input.js`) não precisarem recalcular buff.
- `stepPlayers` aplica a velocidade efetiva (`velocidadeAtual`), então os três
  consumidores da simulação pegam o buff sem mudança. O cooldown efetivo
  (`cooldownDeTiro`) é aplicado nos dois lados autoritativos: `wsServer.js`
  (`handleShoot`) e `bot.js` (`botShoot`), e também no agendamento de tiro do
  bot (`botAI.js`).
- O bot vai buscar bolha: `escolherPowerupAlvo`/`movimentoParaPowerup`
  (`shared/botStrategy.js`) só topam a corrida quando ele não está claramente
  perdendo para o jogador, e o desvio de tiro continua tendo prioridade sobre
  ir pegar o item.
- No desempate as bolhas são descartadas junto com os projéteis (`congelarPartida`
  nos dois donos de loop): a partida congela, ninguém andaria até elas.
- Ninguém avisa o cliente que uma bolha surgiu ou foi coletada: os dois eventos
  saem da comparação da lista do snapshot com a do frame anterior
  (`public/js/powerups.js`), mesmo padrão de tiro/dano/bloqueio em `hud.js` —
  vale de graça para os dois jogadores e para os três modos, incluindo
  espectador, sem mensagem nova no protocolo.
- Quem está sob efeito **pisca na cor do buff** (amarelo = cadência, branco =
  velocidade; com os dois ativos, alterna). É um brilho colorido em volta da
  silhueta (`glow` em `drawCharacterFrame`), não um tint: colorir os pixels do
  sprite exigiria um canvas fora da tela por classe/quadro.

### Eventos de arena

Toda partida sorteia uma das quatro arenas (`public/assets/arenas/arena_1.png`
a `arena_4.png` — terra, areia, gelo e fogo, nessa ordem) e cada uma interfere
de um jeito diferente na partida. Regra de jogo, então vive em
`shared/arenaEvents.js` — fonte única para servidor, modo treino e o desenho
no cliente (`public/js/arenaVisuals.js`).

- **Terra**: terremotos periódicos, **só visual/sonoro** — a câmera treme
  (`terremotoShakeOffset` em `arenaVisuals.js`, aplicado como um `translate`
  em volta do desenho inteiro em `render.js`) e toca um rumor grave
  (`playTerremotoSound`), mas não mexe em posição, velocidade ou dano de
  ninguém. É o único dos quatro eventos que não passa por `stepPlayers`. Cada
  tremor dura `TERREMOTO_DURACAO_MS` (4,5s) e não bate com força constante:
  `terremotoIntensidade` varia a intensidade-base entre ocorrências (do leve
  ao devastador, pelo índice do ciclo) e `terremotoProgresso` dá um envelope
  em sino dentro da própria duração (sobe, sustenta perto do pico, cai) em vez
  de ligar/desligar de repente. Nos últimos `ARENA_FASE_FINAL_MS` (0:15) o
  tremor deixa de ser periódico e **não para mais** (`faseFinalContinua`) — o
  progresso passa a oscilar numa faixa que nunca chega às pontas do envelope.
  Por causa disso o som é disparado na borda de subida de um **índice** de
  tremor (`terremotoPulsoAntes` em `arenaVisuals.js`) e não de um booleano de
  "está ativo": um booleano tocaria o rumor uma vez só e a câmera sacudiria em
  silêncio pelos 14s da fase final.
- **Areia**: rajadas de vento periódicas empurram **os dois jogadores** para o
  mesmo lado — não é vantagem de ninguém, então a direção não precisa ser
  sorteada por partida: vem do índice do ciclo (`ventoDirecao`), alternando a
  cada rajada. Nos últimos `ARENA_FASE_FINAL_MS` (0:15) a pausa entre rajadas
  deixa de existir e o vento **não para mais** (`faseFinalContinua`, igual ao
  terremoto): só troca de lado na virada do ciclo.
  `public/js/arenaVisuals.js` desenha riscos de areia atravessando a tela na
  direção do vento.
- **Gelo**: piso escorregadio a partida inteira. Em vez do movimento parar
  assim que solta a tecla (como nas outras arenas), `stepPlayers` passa a
  acumular velocidade "de embalo" (`p.vx`/`p.vy`, ver `shared/entities.js`) que
  só se aproxima da velocidade do input a cada tick, em vez de igualá-la —
  isso é o que dá a sensação de deslize.
- **Fogo**: erupções **miradas nos jogadores**, não em posição aleatória.
  Cada onda cai com as **duas ao mesmo tempo**, uma em cima de cada jogador —
  `tickErupcoes` captura a posição de cada um no instante em que a onda
  surge (`criarErupcoes` só sorteia o horário das ondas, mesmo padrão de
  `criarPowerups`); depois disso o alvo fica fixo, então dá pra escapar
  andando para longe antes de explodir. Cada erupção avisa por
  `ERUPCAO_AVISO_MS` (círculo pulsando) antes de explodir, causando dano e
  empurrando para longe do centro quem ainda estiver dentro na hora. É a
  arena mais agressiva de propósito: `ERUPCAO_JANELAS_MS` tem seis janelas
  (o dobro das outras agendas de arena), uma onda nova a cada ~9-10s de
  partida.

Terremoto e vento param de vez com `ARENA_EVENTO_FIM_MS` (1s) de tempo
restante: o último segundo — e todo o desempate depois dele — fica limpo, para
o momento que decide a partida não ser disputado com a tela sacudindo nem com
os dois jogadores sendo empurrados.

Terremoto, vento e gelo são **puramente determinísticos**: dependem só do
relógio (`agora`, o mesmo `Date.now()` que já passa para `stepPlayers`), sem
parte aleatória — servidor, bot e o desenho no cliente concordam sem precisar
de nada novo no protocolo, e o cliente pode tremer a câmera/desenhar o vento
sem esperar snapshot nenhum. Só o fogo tem posição sorteada por partida, por
isso é o único dos quatro com agenda/estado sincronizados via snapshot
(`erupcoes`, mesmo lugar de `powerups` na mensagem `state` e no `init` do
espectador).

- `stepPlayers` (`shared/simulation.js`) recebe `arenaTipo` como quarto
  parâmetro e aplica o empurrão do vento e o deslize do gelo — os três
  consumidores da simulação (servidor, bot e a própria bateria de testes)
  pegam o efeito de graça, sem duplicar lógica. Terra e fogo não entram aqui:
  terremoto é só render.js, e o dano/knockback do fogo é aplicado por
  `tickErupcoes`, não por `stepPlayers`.
- Erupções não têm projétil nem `onPlayerDown`: como podem matar um ou os
  dois jogadores no mesmo tick, quem chama `tickErupcoes` (`Match.js`,
  `bot.js`) confere quem ainda está vivo logo depois e decide o fim de
  partida ali mesmo (vitória, ou empate se os dois morrerem juntos — mesma
  regra do desempate por tempo).
- No desempate, `congelarPartida` também descarta as erupções ativas nos dois
  donos de loop, pelo mesmo motivo dos power-ups: a partida está congelada,
  ninguém andaria até lá nem veria o resto da explosão.
- As duas pistas sonoras da erupção saem do **diff do snapshot** em
  `arenaVisuals.js` (`diffErupcoes`) — mesmo padrão de diff entre frames que o
  HUD usa para tiro/dano/bloqueio e que `powerups.js` usa para spawn/coleta:
  id novo em `fase: 'aviso'` toca a sirene (`playEruptionWarningSound`, o
  único efeito que vem de arquivo), e a transição `aviso` →
  `explosao` toca o estrondo (`playEruptionSound`) e joga as partículas
  laranja de `spawnExplosion` no ponto da erupção, dimensionadas pelo `raio`
  dela. `ERUPCAO_AVISO_MS` precisa caber reação humana **mais** a caminhada
  até fora do raio (a erupção nasce em cima do jogador, então sair de dentro
  custa `ERUPCAO_RAIO` px de deslocamento) — encurtar isso deixa a arena de
  fogo impossível de desviar. O
  terremoto dispara `playTerremotoSound` na borda de subida de
  `terremotoProgresso(now)` (calculado localmente, sem precisar de snapshot). O
  vento ainda não tem som próprio (só o visual).
- Enquanto o tutorial interativo roda (`isMatchTutorialActive()`), os mapas
  não têm efeito nenhum: `bot.js` passa `arenaTipo: null` para `stepPlayers` e
  `tickErupcoes` (desliga vento/gelo/fogo) e `arenaVisuals.js` zera o tremor
  de câmera e as partículas de vento — quem está aprendendo os controles não
  deveria lidar com isso ainda. `state.arenaTipo` continua valendo pro fundo
  da arena (só a física/eventos são desligados), e como o tutorial só roda no
  modo bot, o servidor nunca precisa dessa checagem.

### Modo espectador (assistir partidas em andamento)

Qualquer partida online 1x1 em andamento pode ser assistida em modo leitura,
sem entrar no matchmaking e sem afetar o jogo dos dois jogadores. O painel
"Partidas ao vivo" (`#spectatorPanel`, na tela de menu, logo abaixo dos
containers de início) lista as partidas ativas com um botão "Assistir".

- `GET /api/live-matches` (`httpServer.js`, público, mesmo CORS de
  `/api/online-count`) devolve `listActiveMatches()` (`matchmaking.js`): id,
  nome e classe dos dois jogadores de cada partida que já passou da contagem
  regressiva (`match.interval` existe — antes disso ainda não há nada pra
  assistir). `public/js/liveMatches.js` faz poll dessa rota a cada 5s e para
  de pollar assim que o cliente entra em qualquer partida/tela de jogo
  (`showGame()`/`showMenu()` em `menu.js`, mesmo padrão de `onlineCount.js`).
- Um espectador se conecta no **mesmo** WebSocket do jogo, mas com
  `?spectate=<matchId>` na query string em vez de `nickname`/`classId`/`token`.
  `wsServer.js` detecta esse parâmetro **antes** de resolver identidade/sessão
  e desvia a conexão para `attachSpectator`/`detachSpectator` (`Match.js`) em
  vez do fluxo normal de `handleConnection` — esse socket nunca vira
  `ws.player`/`ws.match`, então mesmo que o cliente tente mandar `input`/`shoot`
  (não manda, mas o servidor não confia nisso) não há jogador pra aplicar.
  `matchId` inválido ou de partida já encerrada recebe `{ type: 'error' }` e a
  conexão é fechada.
- Assistir não exige fila, conta nem nickname — só saber um `matchId` (público
  via `/api/live-matches`). Sem limite, isso seria um vetor barato de DoS: cada
  espectador conectado multiplica o broadcast de `state` a 60hz da partida, e
  não há verificação de origem no handshake do WS. Por isso `attachSpectator`
  recusa conexão além de `MAX_SPECTATORS_PER_MATCH` (`Match.js`, hoje 10 —
  valor conservador por enquanto, dá pra subir depois que houver alguma
  métrica de uso real do painel de espectadores) —
  devolve `false`, e `wsServer.js` manda `{ type: 'error' }` e fecha o socket,
  sem afetar os espectadores já conectados nem a partida em si.
- `match.spectators` (`Set` em `Match.js`) recebe o mesmo broadcast de
  `state`/`gameover` que os dois jogadores (`broadcastState`/`endMatch`). Ao
  entrar, `attachSpectator` manda um `init` com `playerIndex: null` e o
  snapshot **atual** dos dois jogadores — a partida pode estar em andamento
  há um tempo quando o espectador chega, então não existe contagem regressiva
  para ele: o cliente cai direto no jogo (`state.matchStarted = true` já no
  `init`, em `connectSpectator`/`network.js`).
- `playerIndex: null` é o sinal de "sem jogador local" que os módulos de
  partida do cliente precisam tratar (modo `state.mode === 'spectator'`):
  `hud.js` usa `state.playerIndex ?? 0` como o slot 0 do HUD (em vez de não
  preencher nenhum lado), `render.js` não desenha marcador/seta de "você" nem
  prévia de mira em nenhum dos dois jogadores e colore os projéteis por dono
  (slot 0 = amarelo, slot 1 = vermelho) em vez de "meu tiro", e `input.js`
  ignora teclado e clique por completo nesse modo — só o ESC continua
  funcionando, para sair a qualquer momento (`backToMenu`, que fecha o
  WebSocket como em qualquer outro modo).
- O resto do HUD/arena é **quase idêntico** ao de quem está jogando —
  corações, escudos, nomes reais, cronômetro — então sem um sinal explícito
  seria fácil achar que é a própria partida. Três pistas visuais cobrem isso,
  todas ligadas por `body.spectating` (`showSpectatorBanner`/
  `hideSpectatorBanner` em `hud.js`, chamado no `init` do espectador e limpo
  em `resetHud`): `#spectatorBanner` mostra "Assistindo" abaixo do
  cronômetro, o nome do jogador do slot 0 perde o dourado que marca "seu
  nome" nos outros modos (`body.spectating #nameP0` em `style.css` — aqui o
  slot 0 não é "você"), e a borda da arena (`drawArenaBorder` em `render.js`)
  fica amarela (`ARENA_BORDER_COLOR_SPECTATOR`) em vez do vermelho padrão. O
  aviso de ESC também muda de texto ("parar de assistir" em vez de "sair")
  nesse modo.
- Fim de partida assistida usa `recordSpectatorGameOver` (`gameOver.js`), não
  `recordGameOver`: sem "você" não existe vitória/derrota, só quem venceu (ou
  empate, no caso de desempate zerando os dois no mesmo passo) — sem jingle de
  vitória/derrota, e o overlay some com os botões "Jogar novamente"/"Trocar
  classes", sobrando só "Menu inicial".
- Não gera histórico nem conta como jogador: `saveMatchResult`
  (`matchHistory.js`) e o `endMatch` de `Match.js` só olham `match.players`,
  nunca `match.spectators`.

### Histórico de versões

O changelog do jogo vive em dois lugares que precisam andar juntos:
`CHANGELOG.md` na raiz (fonte da documentação) e a modal "Novidades" do menu
(`#changelogOverlay` no `index.html`, aberta pelo `#btnChangelog`). Ao publicar
uma versão nova, o bloco entra nos dois e o número em `#menuVersion` é
atualizado. O conteúdo da modal é HTML estático dentro do `index.html`, então
`public/js/changelog.js` só cuida do abre/fecha, no mesmo padrão de
`credits.js`. Diferente das outras modais, quem rola é o corpo
(`#changelogBody`), não a modal inteira: o cabeçalho com o botão de fechar
precisa continuar visível enquanto a lista de versões cresce.

O texto é escrito para jogador, não para desenvolvedor: descreve o que mudou na
partida, não o commit. Versões atuais: `beta 0.1` (sprites dos personagens e o
jogo como estava até então) e `beta 0.2` (power-ups na arena).

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
