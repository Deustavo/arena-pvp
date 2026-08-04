// Tela de histórico de partidas da conta. Só existe para quem está logado —
// partidas de convidado e contra bot não são gravadas.

import {
  profileOverlayEl, profileSummaryEl, profileBodyEl,
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

function renderPartidas(matches) {
  if (matches.length === 0) {
    profileBodyEl.innerHTML = '<p class="profile-vazio">Você ainda não jogou nenhuma partida online. '
      + 'Partidas do modo treino não entram no histórico.</p>';
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

async function carregar() {
  profileSummaryEl.innerHTML = '';
  profileBodyEl.innerHTML = '<p class="profile-vazio">Carregando...</p>';
  try {
    const res = await fetch(`${BACKEND_URL}/api/me/matches`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error('resposta inválida');
    const { matches, summary } = await res.json();
    renderResumo(summary);
    renderPartidas(matches);
  } catch {
    profileSummaryEl.innerHTML = '';
    profileBodyEl.innerHTML = '<p class="profile-vazio">Não foi possível carregar seu histórico agora.</p>';
  }
}

function abrir() {
  profileOverlayEl.classList.add('visible');
  carregar();
}

function fechar() {
  profileOverlayEl.classList.remove('visible');
}

export function initProfile() {
  btnProfile.addEventListener('click', abrir);
  btnProfileClose.addEventListener('click', fechar);
  profileOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === profileOverlayEl) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && profileOverlayEl.classList.contains('visible')) fechar();
  });
}
