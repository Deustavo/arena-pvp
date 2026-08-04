// Estatísticas derivadas do histórico já carregado no perfil. Funções puras
// (sem DOM e sem rede) para serem testáveis no Node — o profile.js só formata
// o que sai daqui.

// Quantas partidas recentes contam para o ranking de classes. O histórico da
// API já vem limitado a 20 partidas, mas o corte fica explícito aqui para a
// estatística continuar sendo "as últimas 20" se o limite da rota mudar.
export const PARTIDAS_CONSIDERADAS = 20;

// Top classes usadas pelo jogador nas últimas `PARTIDAS_CONSIDERADAS` partidas
// (as partidas chegam da API já ordenadas da mais recente para a mais antiga).
// Empate no total de partidas é resolvido pela classe usada mais recentemente,
// que é a ordem em que as classes aparecem na lista.
export function topClassesUsadas(matches, limite = 3) {
  const totais = new Map();
  for (const partida of (matches ?? []).slice(0, PARTIDAS_CONSIDERADAS)) {
    const classId = partida?.playerClass;
    if (!classId) continue;
    totais.set(classId, (totais.get(classId) ?? 0) + 1);
  }

  return [...totais.entries()]
    .map(([classId, total]) => ({ classId, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
}
