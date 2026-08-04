// Ranking global de contas por vitórias, exibido ao lado do menu inicial.

import { rankingListEl } from './dom.js';
import { BACKEND_URL } from './config.js';
import { state } from './state.js';
import { abrirPerfilDeJogador } from './profile.js';

const RANKING_POLL_MS = 30000;
let rankingInterval = null;
let ultimoRanking = null;

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function renderRanking(ranking) {
  ultimoRanking = ranking;
  if (ranking.length === 0) {
    rankingListEl.innerHTML = '<p class="ranking-vazio">Nenhuma conta jogou ainda.</p>';
    return;
  }
  const nomeJogadorLogado = state.user?.name?.toLowerCase();
  const linhas = ranking.map((jogador, indice) => {
    const ehJogadorLogado = jogador.name.toLowerCase() === nomeJogadorLogado;
    const classeNome = ehJogadorLogado ? 'ranking-nome ranking-nome-proprio' : 'ranking-nome';
    return `<li>
    <span class="ranking-posicao">${indice + 1}º</span>
    <button type="button" class="${classeNome}" title="Ver perfil de ${escaparHtml(jogador.name)}">${escaparHtml(jogador.name)}</button>
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

// Delegação: a lista é reescrita a cada poll, então o listener fica no <ol> e
// não em cada nome. O nome vai para o perfil a partir do textContent, sem
// precisar guardá-lo num atributo.
export function initRanking() {
  rankingListEl.addEventListener('click', (e) => {
    const botao = e.target.closest('.ranking-nome');
    if (botao) abrirPerfilDeJogador(botao.textContent);
  });
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

// loadSession() (main.js) resolve depois do primeiro fetchRanking, então o nome
// do jogador logado pode não estar disponível ainda no primeiro render — sem
// isso, o destaque amarelo só apareceria no próximo poll (30s depois).
export function refreshRankingHighlight() {
  if (ultimoRanking) renderRanking(ultimoRanking);
}
