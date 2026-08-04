// Tela de histórico de partidas de uma conta. Serve tanto para o perfil do
// próprio jogador logado (botão "Perfil") quanto para o perfil público de
// outra conta, aberto ao clicar num nome do ranking. Partidas de convidado e
// contra bot não são gravadas, então não aparecem aqui.

import {
  profileOverlayEl, profileTitleEl, profileSummaryEl, profileClassesEl, profileBodyEl,
  btnProfile, btnProfileClose,
} from './dom.js';
import { BACKEND_URL } from './config.js';
import { getToken } from './auth.js';
import { getClass } from '../../shared/classes.js';
import { topClassesUsadas, PARTIDAS_CONSIDERADAS } from './profileStats.js';

const RESULTADOS = {
  win: { texto: 'Vitória', classe: 'resultado-vitoria' },
  loss: { texto: 'Derrota', classe: 'resultado-derrota' },
  draw: { texto: 'Empate', classe: 'resultado-empate' },
};

// Quantas partidas cada página do histórico traz (mesmo valor do LIMITE_PADRAO
// da rota; o servidor prende o limite pedido a um teto de qualquer forma).
const TAMANHO_PAGINA = 20;
// A que distância do fim da lista (em px) começa a carregar a próxima página.
const MARGEM_SCROLL = 120;

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

// Top 3 classes mais usadas nas últimas partidas. Sai da primeira página do
// histórico (as últimas 20 partidas), sem pedir nada a mais à API.
function renderClassesMaisUsadas(matches) {
  const top = topClassesUsadas(matches);
  if (top.length === 0) {
    profileClassesEl.innerHTML = '';
    return;
  }

  const itens = top.map(({ classId, total }) => {
    const cls = getClass(classId);
    return `<li class="classe-usada">
      <span class="class-icon" style="--class-color: ${cls.color}">${cls.icon}</span>
      <span class="classe-usada-nome">${escaparHtml(cls.name)}</span>
      <span class="classe-usada-total">${total} ${total === 1 ? 'partida' : 'partidas'}</span>
    </li>`;
  });

  profileClassesEl.innerHTML = `
    <h3 class="profile-subtitulo">Classes mais usadas (últimas ${PARTIDAS_CONSIDERADAS} partidas)</h3>
    <ul class="lista-classes-usadas">${itens.join('')}</ul>
  `;
}

function linhaPartida(partida) {
  const resultado = RESULTADOS[partida.result] ?? RESULTADOS.draw;
  return `<li class="partida">
    <span class="partida-resultado ${resultado.classe}">${resultado.texto}</span>
    <span class="partida-oponente">vs ${escaparHtml(partida.opponentName)}</span>
    <span class="partida-classes">${nomeDaClasse(partida.playerClass)} x ${nomeDaClasse(partida.opponentClass)}</span>
    <span class="partida-data">${formatarData(partida.createdAt)}</span>
  </li>`;
}

function renderPrimeiraPagina(matches, vazioTexto) {
  if (matches.length === 0) {
    profileBodyEl.innerHTML = `<p class="profile-vazio">${vazioTexto}</p>`;
    listaEl = null;
    return;
  }
  profileBodyEl.innerHTML = `<ul class="lista-partidas">${matches.map(linhaPartida).join('')}</ul>`;
  listaEl = profileBodyEl.querySelector('.lista-partidas');
}

function appendPartidas(matches) {
  if (!listaEl || matches.length === 0) return;
  listaEl.insertAdjacentHTML('beforeend', matches.map(linhaPartida).join(''));
}

// O nome do oponente é texto digitado por outro jogador (convidados escolhem
// o próprio nickname), então nunca vai para o HTML sem escapar.
function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// Estado da lista aberta agora: o histórico é paginado (as últimas
// TAMANHO_PAGINA partidas, mais uma página a cada vez que o jogador chega perto
// do fim da lista), então é preciso lembrar de onde continuar.
let perfilAberto = null;
let proximoOffset = 0;
let temMais = false;
let carregando = false;
let listaEl = null;
// Cada abertura de perfil ganha um id: resposta de uma requisição de um perfil
// já fechado (ou de outro jogador) chega atrasada e precisa ser ignorada.
let aberturaAtual = 0;

async function buscarPagina(perfil, offset) {
  const url = new URL(perfil.url);
  url.searchParams.set('limit', String(TAMANHO_PAGINA));
  url.searchParams.set('offset', String(offset));
  const res = await fetch(url, { headers: perfil.headers });
  if (!res.ok) throw new Error('resposta inválida');
  return res.json();
}

// `perfil` descreve de quem é o histórico: a URL a buscar, o título do modal e
// os textos de vazio/erro (que falam na segunda pessoa no perfil próprio e na
// terceira no de outro jogador).
async function carregar(perfil) {
  const abertura = ++aberturaAtual;
  perfilAberto = perfil;
  proximoOffset = 0;
  temMais = false;
  carregando = true;
  listaEl = null;

  profileTitleEl.textContent = perfil.titulo;
  profileSummaryEl.innerHTML = '';
  profileClassesEl.innerHTML = '';
  profileBodyEl.innerHTML = '<p class="profile-vazio">Carregando...</p>';
  profileBodyEl.scrollTop = 0;

  try {
    const { matches, summary, hasMore } = await buscarPagina(perfil, 0);
    if (abertura !== aberturaAtual) return;
    renderResumo(summary);
    // "Classes mais usadas" olha só as últimas TAMANHO_PAGINA partidas, então é
    // calculada uma vez com a primeira página e não muda conforme o scroll.
    renderClassesMaisUsadas(matches);
    renderPrimeiraPagina(matches, perfil.vazio);
    proximoOffset = matches.length;
    temMais = Boolean(hasMore);
  } catch {
    if (abertura !== aberturaAtual) return;
    profileSummaryEl.innerHTML = '';
    profileClassesEl.innerHTML = '';
    profileBodyEl.innerHTML = `<p class="profile-vazio">${perfil.erro}</p>`;
  } finally {
    if (abertura === aberturaAtual) {
      carregando = false;
      garantirListaRolavel();
    }
  }
}

async function carregarMais() {
  if (!perfilAberto || !temMais || carregando) return;
  const abertura = aberturaAtual;
  const perfil = perfilAberto;
  carregando = true;
  mostrarCarregandoMais(true);

  try {
    const { matches, hasMore } = await buscarPagina(perfil, proximoOffset);
    if (abertura !== aberturaAtual) return;
    appendPartidas(matches);
    proximoOffset += matches.length;
    // Sem partidas novas (ou sem lista para acrescentar) o scroll pararia de
    // pedir mais de qualquer forma; zerar a flag evita um loop de requisições.
    temMais = Boolean(hasMore) && matches.length > 0 && listaEl !== null;
  } catch {
    // Falha ao carregar mais não desmonta o que já está na tela: para de pedir
    // e deixa o histórico que o jogador já tem visível.
    if (abertura === aberturaAtual) temMais = false;
  } finally {
    if (abertura === aberturaAtual) {
      carregando = false;
      mostrarCarregandoMais(false);
      garantirListaRolavel();
    }
  }
}

// Enquanto houver mais partidas mas a lista ainda não passar da altura do
// container, não existe scroll para disparar o carregamento — então puxa a
// próxima página direto.
function garantirListaRolavel() {
  if (!temMais || carregando) return;
  if (profileBodyEl.scrollHeight <= profileBodyEl.clientHeight) carregarMais();
}

function mostrarCarregandoMais(visivel) {
  const existente = profileBodyEl.querySelector('.profile-carregando-mais');
  if (!visivel) {
    existente?.remove();
    return;
  }
  if (existente || !listaEl) return;
  profileBodyEl.insertAdjacentHTML(
    'beforeend',
    '<p class="profile-carregando-mais">Carregando mais partidas...</p>',
  );
}

function onScrollHistorico() {
  const { scrollTop, clientHeight, scrollHeight } = profileBodyEl;
  if (scrollHeight - (scrollTop + clientHeight) <= MARGEM_SCROLL) carregarMais();
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
  // Invalida requisições em voo: uma página que chegasse depois de fechar
  // acabaria acrescentada ao histórico do próximo perfil aberto.
  aberturaAtual++;
  perfilAberto = null;
  temMais = false;
  carregando = false;
  listaEl = null;
}

export function initProfile() {
  btnProfile.addEventListener('click', abrirPerfilProprio);
  profileBodyEl.addEventListener('scroll', onScrollHistorico);
  btnProfileClose.addEventListener('click', fechar);
  profileOverlayEl.addEventListener('mousedown', (e) => {
    if (e.target === profileOverlayEl) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && profileOverlayEl.classList.contains('visible')) fechar();
  });
}
