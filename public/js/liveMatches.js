// Painel de partidas em andamento no menu, abaixo dos containers de início —
// lista pública (sem autenticação) de quem está jogando online agora, com
// opção de assistir em modo leitura (ver network.js `connectSpectator`).

import { liveMatchesListEl } from './dom.js';
import { BACKEND_URL } from './config.js';
import { getClass } from '../../shared/classes.js';
import { watchMatch } from './menu.js';

const LIVE_MATCHES_POLL_MS = 5000;
let liveMatchesInterval = null;

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function nomeClasse(classId) {
  return getClass(classId)?.name || classId;
}

function renderLiveMatches(matches) {
  if (matches.length === 0) {
    liveMatchesListEl.innerHTML = '<p class="ranking-vazio">Nenhuma partida em andamento agora.</p>';
    return;
  }
  const linhas = matches.map(({ id, players: [a, b] }) => `<li>
    <span class="live-match-players">${escaparHtml(a.name)} <span class="live-match-classe">(${escaparHtml(nomeClasse(a.classId))})</span> vs ${escaparHtml(b.name)} <span class="live-match-classe">(${escaparHtml(nomeClasse(b.classId))})</span></span>
    <button type="button" class="link-button live-match-watch" data-match-id="${escaparHtml(id)}">Assistir</button>
  </li>`);
  liveMatchesListEl.innerHTML = linhas.join('');
}

async function fetchLiveMatches() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/live-matches`);
    if (!res.ok) throw new Error('resposta inválida');
    const { matches } = await res.json();
    renderLiveMatches(matches);
  } catch {
    liveMatchesListEl.innerHTML = '<p class="ranking-erro">Não foi possível carregar as partidas ao vivo.</p>';
  }
}

// Delegação: a lista é reescrita a cada poll, mesmo padrão de ranking.js.
export function initLiveMatches() {
  liveMatchesListEl.addEventListener('click', (e) => {
    const botao = e.target.closest('.live-match-watch');
    if (botao) watchMatch(botao.dataset.matchId);
  });
}

export function startLiveMatchesPolling() {
  fetchLiveMatches();
  if (!liveMatchesInterval) {
    liveMatchesInterval = setInterval(fetchLiveMatches, LIVE_MATCHES_POLL_MS);
  }
}

export function stopLiveMatchesPolling() {
  if (liveMatchesInterval) {
    clearInterval(liveMatchesInterval);
    liveMatchesInterval = null;
  }
}
