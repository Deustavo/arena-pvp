# Atualizações do Demon Arena

Histórico de versões, da mais nova para a mais antiga.

Este arquivo é a fonte da documentação. O jogador vê a mesma lista na modal
"Novidades" do menu, que é HTML estático em `public/index.html`
(`#changelogOverlay`): ao adicionar uma versão aqui, adicione o bloco
correspondente lá e atualize o número em `#menuVersion`.

## beta 0.2 (6 de agosto de 2026)

### Power-ups na arena

Três bolhas nascem no círculo central ao longo da partida e valem para quem
chegar primeiro. São quatro tipos: vida (de 1 a 3 corações), escudo (1 carga),
cadência (cooldown de tiro pela metade por 10 segundos, com recarga na hora) e
velocidade (40% mais rápido por 10 segundos).

Vida e escudo passam do máximo da classe. Se você já está com tudo cheio, o teto
sobe, então dá para terminar a partida com mais coração do que a classe começa.
Quem está sob efeito de cadência ou velocidade fica com um brilho na cor do
buff, e dá para ver isso no adversário também.

O bot disputa as bolhas. Ele só entra na corrida quando não está claramente
perdendo, e desviar de tiro continua vindo antes de ir buscar o item.

No desempate as bolhas somem junto com os tiros no ar, já que a partida congela
e ninguém andaria até elas.

### Tutorial com passo de power-up

O tutorial ganhou um passo novo: pegar uma bolha. Uma bolha de velocidade nasce
no centro e o boneco de treino continua parado até você pegar.

### Modo espectador

Dá para assistir a qualquer partida online em andamento pelo painel "Partidas ao
vivo", na tela inicial, sem entrar na fila e sem conta. A partida assistida tem
borda amarela em vez de vermelha e uma faixa "Assistindo" abaixo do cronômetro,
para não confundir com uma partida sua. Sai com Esc a qualquer momento.

### Celular

Celular e tablet agora recebem um aviso para jogar no computador em vez de uma
tela quebrada. O jogo é WASD e mouse, não tem controle de toque. Notebook com
tela sensível ao toque continua liberado.

### Equilíbrio e correções

A quantidade de vidas das classes foi reajustada e o dano que estava invertido
entre alguns confrontos foi corrigido.

### Segurança

O matchmaking não deixa mais a mesma conta cair em partida contra ela mesma.
Também foram fechadas brechas de paginação sem limite no histórico, mensagem de
WebSocket sem limite de tamanho e tiro sem validação no servidor, e o número de
espectadores por partida passou a ter teto.

## beta 0.1 (5 de agosto de 2026)

Primeira versão documentada. É o jogo com os personagens no lugar dos quadrados
coloridos que existiam até então.

### Sprites dos personagens

Cada classe passou a ter sprite próprio, do Tiny RPG Character Asset Pack 02 do
Zerie. O personagem vira na direção da mira, e o mesmo sprite aparece nos
cartões de classe e no preview da tela de seleção.

### Seis classes

Atirador, Mago, Tank, Assassino, Duelista e Sniper, cada uma com dano, cadência,
alcance, velocidade e escudo próprios. O Mago atira em leque, o Sniper ganha
dano de longe e o Assassino vive de hit and run.

### Partida online 1x1

Fila de matchmaking, partida de 1 minuto e desempate por morte súbita: acabando
o tempo com os dois vivos, a arena congela e os dois começam a perder um coração
por vez até sobrar um. Zerando no mesmo passo, é empate.

O jogador sempre se vê do lado esquerdo da tela, independente de onde nasceu na
arena.

### Modo treino e tutorial

Partida offline contra bot, com escolha da sua classe, da classe do bot e da
dificuldade, do noob ao demoníaco. O bot mira, reage, desvia e ergue escudo de
acordo com a dificuldade, e joga de forma diferente conforme a classe dele.

O tutorial deixou de ser uma tela explicativa e virou uma partida de verdade
contra um boneco de treino, com uma faixa no topo pedindo a próxima ação. O
relógio não corre enquanto ele está rolando.

### Contas, ranking e perfil

Conta com e-mail e senha, verificação de e-mail e recuperação de senha. Quem não
quiser criar conta continua entrando como convidado, só com um nickname.

O ranking top 10 por vitórias fica na tela inicial. Clicando num nome abre o
perfil daquele jogador, com histórico de partidas e as classes que ele mais usa.
Só partida online entre contas entra no histórico.

### Som, música e tela inicial

Todos os efeitos são sintetizados na hora, sem nenhum arquivo de áudio: tiro,
dano, escudo bloqueando e quebrando, explosão, tiro passando raspando, tique dos
últimos 10 segundos e a buzina do desempate.

A tela inicial toca música de fundo, com botão de pular faixa e mudo que fica
salvo no navegador. As músicas são do Jeremy Black, e a tela de créditos mostra
a trilha e os assets usados no jogo.

A tela inicial também ganhou fundo com paralaxe, rastro de fogo no cursor, fogo
no título e contagem de jogadores online.
