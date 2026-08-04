# Análise inicial de balanceamento — 2026-08-03

Relatório interativo: https://claude.ai/code/artifact/176c5d35-ebd9-4f53-a72b-281d74ca69ed
(substituído pela versão em [2026-08-03-rebalanceamento-classes.md](./2026-08-03-rebalanceamento-classes.md)
após o ajuste de status do mesmo dia — o link do artefato foi reaproveitado e
agora mostra o relatório mais recente).

## Objetivo

Medir a taxa de vitória de cada uma das 6 classes jogáveis simulando 100
partidas por confronto (todas contra todas, incluindo espelho), antes de
qualquer ajuste de status.

## Metodologia

- Simulação headless usando `shared/simulation.js`, `shared/entities.js` e
  `shared/classes.js` diretamente — a mesma fonte de verdade de física/dano
  usada pelo servidor.
- IA idêntica nos dois lados da arena (dificuldade `intermediário` de
  `shared/botDifficulty.js`), generalizada a partir de `src/server/botAI.js`
  (que originalmente só previa bot no lado direito) para controlar qualquer
  um dos dois lados.
- 100 partidas por confronto, 2400 partidas por classe no total.

## Resultado (status originais, antes do rebalanceamento)

| Classe    | Vitória geral |
|-----------|--------------:|
| Tank      | 58.2%         |
| Duelista  | 49.3%         |
| Atirador  | 48.6%         |
| Mago      | 48.3%         |
| Assassino | 47.7%         |
| Sniper    | 47.3%         |

Tank já era a classe mais forte antes de qualquer mudança (vida 11, escudo 3,
dano 4, cadência 2.0s) — vencia 84% contra Sniper e 65% contra Duelista.

## Motivação para o rebalanceamento seguinte

Vida e escudo eram muito parecidos entre as 6 classes (vida 9–11, escudo 1–3),
sem diferenciação clara de "papel" (tanque, glass cannon, etc.). Isso motivou
o ajuste registrado em
[2026-08-03-rebalanceamento-classes.md](./2026-08-03-rebalanceamento-classes.md).
