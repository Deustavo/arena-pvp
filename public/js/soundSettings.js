// Painel de volume, acessível em qualquer tela (menu ou partida) por um botão
// fixo no canto da janela. Hoje só existe o controle de efeitos sonoros;
// quando o jogo tiver música, ela ganha sua própria linha aqui e seu próprio
// bus em audio.js — nenhum dos dois deve compartilhar volume com o outro.
import { soundSettingsEl, btnSoundSettings, volumeEfeitosInput } from './dom.js';
import { getEffectsVolume, setEffectsVolume } from './audio.js';

function atualizarIcone(volume) {
  soundSettingsEl.classList.toggle('muted', volume === 0);
}

function abrirPainel() {
  soundSettingsEl.classList.add('open');
  btnSoundSettings.setAttribute('aria-expanded', 'true');
}

function fecharPainel() {
  soundSettingsEl.classList.remove('open');
  btnSoundSettings.setAttribute('aria-expanded', 'false');
}

export function initSoundSettings() {
  if (!soundSettingsEl || !btnSoundSettings || !volumeEfeitosInput) return;

  const volumeInicial = getEffectsVolume();
  volumeEfeitosInput.value = String(volumeInicial);
  atualizarIcone(volumeInicial);

  btnSoundSettings.addEventListener('click', () => {
    if (soundSettingsEl.classList.contains('open')) fecharPainel();
    else abrirPainel();
  });

  volumeEfeitosInput.addEventListener('input', () => {
    const volume = Number(volumeEfeitosInput.value);
    setEffectsVolume(volume);
    atualizarIcone(volume);
  });

  document.addEventListener('click', (e) => {
    if (!soundSettingsEl.contains(e.target)) fecharPainel();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharPainel();
  });
}
