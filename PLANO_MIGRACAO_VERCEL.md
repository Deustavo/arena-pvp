# Plano: separar front (Vercel) e back (Cloud Run)

## Objetivo

Hoje uma única imagem/instância no Cloud Run serve arquivos estáticos (`public/`,
`shared/`), o endpoint `GET /api/online-count` e o WebSocket autoritativo de
partidas. Este plano move os arquivos estáticos para a Vercel, deixando o Cloud
Run responsável **apenas** pelo WebSocket + `/api/online-count`, para que o
Cloud Run escale a zero (e pare de gerar custo) quando não há partidas ativas.

Não deve haver nenhuma duplicação de regra de jogo: `shared/` continua sendo a
fonte única de verdade e é copiado (não reescrito) para os dois lados.

## Pré-requisitos / decisões já tomadas

- Domínio do backend: usar a URL padrão do Cloud Run (`https://<serviço>-<hash>.<região>.run.app`)
  a menos que o usuário já tenha um domínio customizado — **perguntar ao usuário
  antes de codificar a URL final em `network.js`/`onlineCount.js`**, não assumir.
- Vercel: assume-se conta Vercel já configurada e CLI (`vercel`) disponível ou
  deploy via dashboard conectando o repo Git. Se não houver, o agente deve parar
  e perguntar antes de tentar `vercel login`/criar projeto.

## Passo a passo

### 1. Preparar `shared/` para ser publicado junto do front

`public/js/**` importa `shared/*.js` via paths relativos (`../../shared/...`,
e `../../../shared/...` em `public/js/tutorial/steps.js`) que hoje resolvem
para `/shared/*` porque `src/server/httpServer.js` reescreve esse prefixo
(`resolveRequestPath`, linhas ~33-38) servindo de fora de `public/`.

Na Vercel só o conteúdo de `public/` (ou o que for configurado como diretório
de output) é publicado, então `shared/` precisa passar a existir dentro da
árvore publicada, em `public/shared/`.

Duas opções — escolher a mais simples e registrar a escolha no commit:

- **(a) Script de build**: adicionar em `package.json` um script tipo
  `"build:front": "node scripts/copy-shared.mjs"` que copia `shared/*.js` para
  `public/shared/*.js` antes do deploy, e configurar esse script como
  "Build Command" no `vercel.json`/dashboard. Vantagem: `shared/` continua
  existindo em um único lugar no repo (fonte), a cópia é gerada.
- **(b) Symlink versionado** (`public/shared -> ../shared`): mais simples, mas
  git e alguns ambientes de build lidam mal com symlinks versionados
  multiplataforma. Evitar a menos que (a) dê problema.

Recomendação: opção (a).

Não editar os imports existentes em `public/js/**/*.js` — eles continuam
`../../shared/...`, que a partir de `public/js/` resolve para `public/shared/`,
sem mudar nenhuma linha de código de import.

### 2. Apontar o cliente para o backend do Cloud Run

- `public/js/network.js` (linhas ~20-23): hoje monta a URL do WS assim:
  ```js
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${protocol}//${location.host}?nickname=${nickname}&classId=${classId}`);
  ```
  Trocar `location.host` por uma constante configurável, ex. um novo arquivo
  `public/js/config.js` exportando `export const BACKEND_HOST = 'jogo-do-ano-xxxx.run.app';`
  e usar `wss://${BACKEND_HOST}?...`. Preferir sempre `wss:` já que o backend
  em Cloud Run é HTTPS-only.

- `public/js/onlineCount.js` (linha ~8): hoje `fetch('/api/online-count')`.
  Trocar para `fetch(`https://${BACKEND_HOST}/api/online-count`)` usando a
  mesma constante de `config.js`.

- Criar `public/js/config.js` com a URL do backend. Se o usuário quiser
  diferenciar preview/produção da Vercel, pode-se ler de uma env var injetada
  em build time (ex. `import.meta.env` não se aplica pois não há bundler —
  mais simples é gerar `config.js` a partir de um template no mesmo script de
  build do passo 1, ou manter hardcoded já que só existe um backend).

### 3. CORS no backend

`src/server/httpServer.js`, handler de `/api/online-count` (linhas ~19-24):
hoje não envia nenhum header CORS. Como o front passa a rodar em outro
domínio (`*.vercel.app`), o fetch cross-origin vai falhar sem
`Access-Control-Allow-Origin`.

Adicionar, antes do `res.writeHead(200, ...)`:
```js
res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
```
com `FRONTEND_ORIGIN` vindo de uma constante/env (ex. `https://jogo-do-ano.vercel.app`).
Evitar `*` já que não há necessidade de abrir para qualquer origem.

O WebSocket em si (`wsServer.js`) não é sujeito à mesma política de CORS do
fetch, mas vale checar se o handshake do `ws` valida `origin` — hoje não faz
(confirmar lendo `src/server/wsServer.js` antes de mexer); se não validar,
nenhuma mudança é necessária ali além de, opcionalmente, adicionar uma checagem
de `origin` no upgrade por segurança (fora do escopo deste plano, só anotar).

### 4. Decidir o que o Cloud Run ainda serve

Depois dos passos 1-3, `public/` não precisa mais ser servido pelo Cloud Run.
Duas opções:

- **Mínima (recomendada para primeira iteração)**: não remover nada de
  `httpServer.js`, só parar de apontar o client para ele. Reduz risco, permite
  rollback fácil (voltar a apontar `network.js` para `location.host`).
- **Limpeza completa (segunda iteração, opcional)**: remover
  `serveStaticFile`/`resolveRequestPath` de `httpServer.js` e não copiar
  `public/` no `Dockerfile`, deixando a imagem do Cloud Run só com
  `src/server/` + `shared/` + `package.json`. Só fazer isso depois que a
  migração estiver validada em produção por um tempo.

Este plano assume a opção mínima primeiro; a limpeza fica como follow-up
opcional, não bloqueante.

### 5. Configurar o projeto Vercel

Criar `vercel.json` na raiz do repo:
```json
{
  "outputDirectory": "public",
  "buildCommand": "npm run build:front"
}
```
(ajustar `buildCommand` conforme o script criado no passo 1). Se a Vercel
detectar automaticamente "sem framework" e servir `public/` como estático,
`outputDirectory` pode ser suficiente sem `buildCommand` explícito — testar
localmente com `vercel dev` antes de assumir.

Adicionar rota catch-all se necessário (não deveria ser preciso, já que hoje
só existe `public/index.html` como HTML e não há client-side routing).

### 6. Cloud Run: nada estrutural muda

`matchmaking.js` e `Match.js` não têm nenhuma dependência de arquivos
estáticos — a lógica de partida já roda 100% em cima de sockets `ws`. O
`Dockerfile`/`cloudbuild.yaml` continuam funcionando como estão na opção
mínima do passo 4. Só revisar se `--min-instances=0` já está setado (está,
segundo o `cloudbuild.yaml` atual) para garantir que o Cloud Run realmente
escala a zero entre partidas.

### 7. Testes e validação manual

- `npm test` continua cobrindo só `shared/`/server — não deve quebrar com essas
  mudanças (nenhum teste hoje deveria depender de `public/js/network.js` rodando
  no browser; confirmar rodando a suíte antes e depois).
- Validação manual obrigatória (é um jogo com WebSocket, `npm test` não cobre
  isso): subir o backend localmente ou apontar para o Cloud Run já em produção,
  publicar o front na Vercel (preview deployment), abrir duas abas/dispositivos
  e jogar uma partida 1x1 completa de ponta a ponta, incluindo:
  - contagem de jogadores online no menu (via `/api/online-count` cross-origin);
  - fila de matchmaking e fallback para bot após `BOT_MATCH_DELAY_MS`;
  - uma partida 1x1 real entre duas conexões;
  - reconexão/gameover.

### 8. Ordem de execução recomendada para o agente executor

1. Passo 1 (script de cópia de `shared/` + `vercel.json` mínimo).
2. Passo 3 (CORS no backend) e deploy do backend atualizado no Cloud Run.
3. Passo 2 (apontar `network.js`/`onlineCount.js` para o backend).
4. Deploy do front na Vercel (preview) e validação manual (passo 7).
5. Promover preview da Vercel para produção.
6. (Opcional, depois de validado) limpeza do passo 4.

## Perguntas que o agente executor deve fazer ao usuário antes de começar

- Confirmar a URL exata do serviço Cloud Run (ou se será criado um domínio
  customizado) para usar em `config.js`/CORS.
- Confirmar se já existe projeto/conta Vercel conectado a este repo, ou se
  precisa ser criado.
- Confirmar se a limpeza do passo 4 (remover estático do Cloud Run) deve ser
  feita já ou só depois de validar em produção.
