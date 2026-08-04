// Tela de histórico de partidas de uma conta. Serve tanto para o perfil do
// próprio jogador logado (botão "Perfil") quanto para o perfil público de
// outra conta, aberto ao clicar num nome do ranking. Partidas de convidado e
// contra bot não são gravadas, então não aparecem aqui.

import {
  profileOverlayEl, profileTitleEl, profileSummaryEl, profileBodyEl,
  btnProfile, btnProfileClose,
} from './dom.js';
import { BACKEND_URL } from './config.js';
import { getToken } from './auth.js';
import { getClass } from '../../shared/classes.js';

const RESULTADOS = {
  win: { texto: 'Vitória', classe: 'resultado-vitoria' },
  loss: { texto: 'Derrota', classe: 'resultado-derrota' },
  draw: { texto: 'Empate', classe: 'resultado-empate' },
};

function nomeDaClasse(classId) {
  return getClass(classId)?.name ?? classId ?? '?';
}

function formatarData(iso) {
  // O servidor grava em UTC ISO 8601; o "Z" garante a conversão para o fuso
  // local do jogador em vez de ser lido como horário local.
  const data = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function renderResumo({ wins, losses, draws, total }) {
  if (total === 0) {
    profileSummaryEl.innerHTML = '';
    return;
  }
  const aproveitamento = Math.round((wins / total) * 100);
  profileSummaryEl.innerHTML = `
    <div class="resumo-item"><strong>${total}</strong><span>partidas</span></div>
    <div class="resumo-item"><strong class="resultado-vitoria">${wins}</strong><span>vitórias</span></div>
    <div class="resumo-item"><strong class="resultado-derrota">${losses}</strong><span>derrotas</span></div>
    <div class="resumo-item"><strong class="resultado-empate">${draws}</strong><span>empates</span></div>
    <div class="resumo-item"><strong>${aproveitamento}%</strong><span>vitórias</span></div>
  `;
}

function renderPartidas(matches, vazioTexto) {
  if (matches.length === 0) {
    profileBodyEl.innerHTML = `<p class="profile-vazio">${vazioTexto}</p>`;
    return;
  }

  const linhas = matches.map((partida) => {
    const resultado = RESULTADOS[partida.result] ?? RESULTADOS.draw;
    return `<li class="partida">
      <span class="partida-resultado ${resultado.classe}">${resultado.texto}</span>
      <span class="partida-oponente">vs ${escaparHtml(partida.opponentName)}</span>
      <span class="partida-classes">${nomeDaClasse(partida.playerClass)} x ${nomeDaClasse(partida.opponentClass)}</span>
      <span class="partida-data">${formatarData(partida.createdAt)}</span>
    </li>`;
  });
  profileBodyEl.innerHTML = `<ul class="lista-partidas">${linhas.join('')}</ul>`;
}

// O nome do oponente é texto digitado por outro jogador (convidados escolhem
// o próprio nickname), então nunca vai para o HTML sem escapar.
function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// `perfil` descreve de quem é o histórico: a URL a buscar, o título do modal e
// os textos de vazio/erro (que falam na segunda pessoa no perfil próprio e na
// terceira no de outro jogador).
async function carregar(perfil) {
  profileTitleEl.textContent = perfil.titulo;
  profileSummaryEl.innerHTML = '';
  profileBodyEl.innerHTML = '<p class="profile-vazio">Carregando...</p>';
  try {
    const res = await fetch(perfil.url, { headers: perfil.headers });
    if (!res.ok) throw new Error('resposta inválida');
    const { matches, summary } = await res.json();
    renderResumo(summary);
    renderPartidas(matches, perfil.vazio);
  } catch {
    profileSummaryEl.innerHTML = '';
    profileBodyEl.innerHTML = `<p class="profile-vazio">${perfil.erro}</p>`;
  }
}

function abrirPerfilProprio() {
  profileOverlayEl.classList.add('visible');
  carregar({
    url: `${BACKEND_URL}/api/me/matches`,
    headers: { Authorization: `Bearer ${getToken()}` },
    titulo: 'Suas partidas',
    vazio: 'Você ainda não jogou nenhuma partida online. '
      + 'Partidas do modo treino não entram no histórico.',
    erro: 'Não foi possível carregar seu histórico agora.',
  });
}

// Perfil público de outra conta (clique num nome do ranking). Não manda token:
// a rota é pública e não devolve nada além do que o ranking já mostra.
export function abrirPerfilDeJogador(nome) {
  profileOverlayEl.classList.add('visible');
  carregar({
    url: `${BACKEND_URL}/api/player/matches?${new URLSearchParams({ name: nome })}`,
    titulo: `Partidas de ${nome}`,
    vazio: 'Esse jogador ainda não jogou nenhuma partida online.',
    erro: 'Não foi possível carregar o perfil desse jogador agora.',
  });
}

function fechar() {
  profileOverlayEl.classList.remove('visible');
}

export function initProfile() {
  btnProfile.addEventListener('click', abrirPerfilProprio);
  btnProfileClose.addEventListener('click', fechar);
  profileOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === profileOverlayEl) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && profileOverlayEl.classList.contains('visible')) fechar();
  });
}
