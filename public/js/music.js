// Player de música de fundo. Diferente de audio.js (efeitos sintetizados na
// hora), aqui são arquivos mp3 reais tocados por um único <audio> element —
// a playlist inteira nunca precisa estar decodificada em memória ao mesmo
// tempo, só a faixa atual.
import {
  musicPlayerEl, btnMusicToggle, musicPanelEl, btnMusicPlayPause,
  btnMusicPrev, btnMusicNext, btnMusicMute, musicTrackNameEl, musicVolumeInput,
} from './dom.js';

// Sem endpoint pra listar o diretório em runtime (servidor estático puro) —
// a playlist é hardcoded aqui. Nome do arquivo dobra como nome de exibição.
const FAIXAS = [
  'Baba - Jeremy Black.mp3',
  'Beatiful Mess - Jeremy Black.mp3',
  'Bongo Rave - Jeremy Black.mp3',
  'Circular Beginning - Jeremy Black.mp3',
  'Cooler Heads - Jeremy Black.mp3',
  'Dream Baby - Jeremy Black.mp3',
  'Electrician - Jeremy Black.mp3',
  'Firestarter - Jeremy Black.mp3',
  'Fly High - Jeremy Black.mp3',
  'I Might Be Late - Jeremy Black.mp3',
  'Juice - Jeremy Black.mp3',
  'Lock - Jeremy Black.mp3',
  'Matterhorn - Jeremy Black.mp3',
  'OvO - Jeremy Black.mp3',
  'Suitcase - Jeremy Black.mp3',
  'Window Shopping - Jeremy Black.mp3',
  'You Know Me - Jeremy Black.mp3',
];

const VOLUME_MUSICA_KEY = 'jogoDoAno.volumeMusica';

function nomeDeExibicao(arquivo) {
  return arquivo.replace(/\.mp3$/, '').replace(/ - Jeremy Black$/, '');
}

// Fisher-Yates: ordem nova a cada abertura do jogo, como pedido — não
// persiste em localStorage de propósito.
function embaralhar(lista) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function lerVolumeSalvo() {
  const salvo = localStorage.getItem(VOLUME_MUSICA_KEY);
  if (salvo === null) return 10;
  const bruto = Number(salvo);
  return Number.isFinite(bruto) && bruto >= 0 && bruto <= 100 ? bruto : 10;
}

let ordem = [];
let indiceAtual = 0;
let audio = null;
let volumeMusica = lerVolumeSalvo();
let mutado = false;

function faixaAtual() {
  return ordem[indiceAtual];
}

function atualizarNomeExibido() {
  musicTrackNameEl.textContent = nomeDeExibicao(faixaAtual());
}

function atualizarIconePlayPause() {
  btnMusicToggle.classList.toggle('playing', !audio.paused);
  btnMusicPlayPause.setAttribute('aria-label', audio.paused ? 'Tocar' : 'Pausar');
  btnMusicPlayPause.classList.toggle('is-paused', audio.paused);
}

function atualizarIconeMute() {
  btnMusicMute.classList.toggle('muted', mutado);
}

function aplicarVolume() {
  audio.volume = mutado ? 0 : volumeMusica / 100;
}

function carregarFaixa(indice, { autoplay } = {}) {
  indiceAtual = ((indice % ordem.length) + ordem.length) % ordem.length;
  audio.src = `assets/music/${encodeURIComponent(faixaAtual())}`;
  atualizarNomeExibido();
  if (autoplay) audio.play().catch(() => {});
}

function proximaFaixa() {
  carregarFaixa(indiceAtual + 1, { autoplay: !audio.paused });
}

function faixaAnterior() {
  carregarFaixa(indiceAtual - 1, { autoplay: !audio.paused });
}

function alternarPlayPause() {
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function alternarMute() {
  mutado = !mutado;
  aplicarVolume();
  atualizarIconeMute();
}

// Toca sozinho ao carregar a página. Navegadores bloqueiam áudio com som
// antes de qualquer gesto do usuário — se `play()` for rejeitado por isso,
// tenta de novo no primeiro clique/tecla em qualquer lugar da página, sem
// exigir que o jogador abra o painel de música.
function tentarAutoplay() {
  audio.play().catch(() => {
    const iniciarNoGesto = () => audio.play().catch(() => {});
    document.addEventListener('pointerdown', iniciarNoGesto, { once: true });
    document.addEventListener('keydown', iniciarNoGesto, { once: true });
  });
}

export function initMusicPlayer() {
  if (!musicPlayerEl || !btnMusicToggle) return;

  audio = new Audio();
  audio.preload = 'auto';
  aplicarVolume();

  ordem = embaralhar(FAIXAS);
  carregarFaixa(0);
  tentarAutoplay();

  audio.addEventListener('ended', proximaFaixa);
  audio.addEventListener('play', atualizarIconePlayPause);
  audio.addEventListener('pause', atualizarIconePlayPause);

  musicVolumeInput.value = String(volumeMusica);

  function abrirPainel() {
    musicPlayerEl.classList.add('open');
    btnMusicToggle.setAttribute('aria-expanded', 'true');
    // Se o autoplay em tentarAutoplay() ainda não pegou (nenhum gesto antes
    // deste clique), este clique já conta como o primeiro gesto.
    if (audio.paused && audio.currentTime === 0) alternarPlayPause();
  }

  // Toca a animação de saída (saida-pop, ver style.css) antes de sumir de
  // verdade — mesmo padrão de soundSettings.js/closeBotClassSelect.
  function fecharPainel() {
    if (!musicPlayerEl.classList.contains('open')) return;
    btnMusicToggle.setAttribute('aria-expanded', 'false');
    musicPanelEl.classList.add('closing');
    musicPanelEl.addEventListener('animationend', () => {
      musicPlayerEl.classList.remove('open');
      musicPanelEl.classList.remove('closing');
    }, { once: true });
  }

  btnMusicToggle.addEventListener('click', () => {
    if (musicPlayerEl.classList.contains('open')) fecharPainel();
    else abrirPainel();
  });

  btnMusicPlayPause.addEventListener('click', alternarPlayPause);
  btnMusicPrev.addEventListener('click', faixaAnterior);
  btnMusicNext.addEventListener('click', proximaFaixa);
  btnMusicMute.addEventListener('click', alternarMute);

  musicVolumeInput.addEventListener('input', () => {
    volumeMusica = Number(musicVolumeInput.value);
    try {
      localStorage.setItem(VOLUME_MUSICA_KEY, String(volumeMusica));
    } catch {
      // localStorage indisponível: preferência só vale para esta sessão.
    }
    if (mutado && volumeMusica > 0) {
      mutado = false;
      atualizarIconeMute();
    }
    aplicarVolume();
  });

  document.addEventListener('click', (e) => {
    if (!musicPlayerEl.contains(e.target)) fecharPainel();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharPainel();
  });
}
