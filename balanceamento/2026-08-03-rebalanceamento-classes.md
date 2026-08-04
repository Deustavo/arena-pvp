# Rebalanceamento de classes — 2026-08-03

Relatório interativo (gráficos e matriz colorida): https://claude.ai/code/artifact/176c5d35-ebd9-4f53-a72b-281d74ca69ed

## Objetivo

Os status das 6 classes estavam muito parecidos entre si (vida 9–11, escudo 1–3).
Este ajuste acentua as diferenças pedidas: Tank com mais vida e escudo que todas as
outras classes; Assassino e Sniper como "glass cannons" (vida bem mais baixa, dano
bem mais alto). Os novos números foram recalibrados com uma simulação headless para
tentar preservar o equilíbrio geral apesar da diferenciação.

## Status: antes → depois

| Classe    | Vida       | Escudo | Dano             | Cadência | Velocidade |
|-----------|-----------:|-------:|------------------|---------:|-----------:|
| Atirador  | 9          | 1      | 3                | 1.0s     | 100%       |
| Mago      | 9 → **8**  | 3      | 2 → **2.5**      | 1.8s → **2.0s** | 100% |
| **Tank**      | 11 → **14** | 3 → **5** | 4 → **2.5** | 2.0s → **2.4s** | 100% |
| **Assassino** | 10 → **6**  | 2 → **1** | 7 → **9**   | 2.25s → **1.6s** | 110% → **130%** |
| Duelista  | 10         | 2      | 1                | 0.375s → **0.43s** | 125% |
| **Sniper**    | 9 → **6**   | 1      | 5 (11 longe) → **7 (15 longe)** | 1.9s → **1.6s** | 100% |

Linhas em negrito são as classes com mudança de identidade pedida (Tank mais
resistente; Assassino/Sniper mais frágeis e com dano maior). Atirador e Duelista
ficaram praticamente como estavam — mexer neles desequilibrava o restante do
elenco sem necessidade.

Dano fracionário (múltiplos de 0.5) já é suportado pelo HUD (meio-coração em
`public/js/hud.js`/`public/css/style.css`), então `2.5` de dano do Mago/Tank
aparece corretamente na UI.

## Metodologia da simulação

- IA idêntica nos dois lados da arena (dificuldade `intermediário` de
  `shared/botDifficulty.js`), para que o resultado venha das estatísticas da
  classe, não de habilidade de jogo.
- IA generalizada a partir de `src/server/botAI.js` (que só previa bot no lado
  direito da arena) para controlar qualquer um dos dois lados.
- 100 partidas por confronto, todas as 6 classes contra todas (incluindo
  espelho) = 2400 partidas por classe no total.
- Rodado fora do servidor real, usando `shared/` diretamente (mesma fonte de
  verdade de física/dano/cooldown usada por servidor, bot local e predição do
  cliente).
- Ajuste feito em ~6 rodadas: a cada rodada, a classe mais forte levava um
  nerf e a mais fraca um buff, até o placar geral de cada classe ficar perto
  de 50%.

## Resultado final (placar geral por classe)

| Classe    | Antes  | Depois |
|-----------|-------:|-------:|
| Tank      | 58.2%  | 47.3%  |
| Atirador  | 48.6%  | 54.7%  |
| Mago      | 48.3%  | 52.1%  |
| Duelista  | 49.3%  | 51.1%  |
| Sniper    | 47.3%  | 48.6%  |
| Assassino | 47.7%  | 45.2%  |

O Tank não domina mais como antes (era a classe mais forte de longe, com 58%);
as outras 5 classes ficam numa faixa de 45–55%.

### Ponto fora da curva conhecido

**Duelista vence Assassino em ~70%** das partidas — um contra-pick esperado
dado o desenho das duas classes (cadência altíssima e alcance longo do
Duelista exploram a vida baixa e o alcance curto do Assassino). Eliminar essa
desvantagem específica exigiria mudanças que prejudicariam o equilíbrio geral
das outras 5 classes, então foi deixada como está.

## Arquivos alterados

- `shared/classes.js` — status e `traits` das 6 classes.
