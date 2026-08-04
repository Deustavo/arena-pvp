// Ranking global de contas por vitórias, exibido ao lado do menu inicial.

import { rankingListEl } from './dom.js';
import { BACKEND_URL } from './config.js';
import { state } from './state.js';

const RANKING_POLL_MS = 30000;
let rankingInterval = null;

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function renderRanking(ranking) {
  if (ranking.length === 0) {
    rankingListEl.innerHTML = '<p class="ranking-vazio">Nenhuma conta jogou ainda.</p>';
    return;
  }
  const nomeJogadorLogado = state.user?.name?.toLowerCase();
  const linhas = ranking.map((jogador) => {
    const ehJogadorLogado = jogador.name.toLowerCase() === nomeJogadorLogado;
    const classeNome = ehJogadorLogado ? 'ranking-nome ranking-nome-proprio' : 'ranking-nome';
    return `<li>
    <span class="${classeNome}">${escaparHtml(jogador.name)}</span>
    <span class="ranking-vitorias">${jogador.wins}</span>
  </li>`;
  });
  rankingListEl.innerHTML = linhas.join('');
}

async function fetchRanking() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ranking`);
    if (!res.ok) throw new Error('resposta inválida');
    const { ranking } = await res.json();
    renderRanking(ranking);
  } catch {
    rankingListEl.innerHTML = '<p class="ranking-erro">Não foi possível carregar o ranking.</p>';
  }
}

export function startRankingPolling() {
  fetchRanking();
  if (!rankingInterval) {
    rankingInterval = setInterval(fetchRanking, RANKING_POLL_MS);
  }
}

export function stopRankingPolling() {
  if (rankingInterval) {
    clearInterval(rankingInterval);
    rankingInterval = null;
  }
}
