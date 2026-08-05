// Painel de volume dos efeitos sonoros, acessível em qualquer tela (menu ou
// partida) por um botão fixo no canto da janela. Música tem seu próprio
// widget (music.js) e seu próprio bus — os dois nunca compartilham volume.
import {
  soundSettingsEl, btnSoundSettings, soundSettingsPanelEl, volumeEfeitosInput, btnEffectsMute,
} from './dom.js';
import {
  getEffectsVolume, setEffectsVolume, getEffectsMuted, setEffectsMuted,
} from './audio.js';

function atualizarIcone(volume, mudo) {
  soundSettingsEl.classList.toggle('muted', mudo || volume === 0);
  btnEffectsMute.classList.toggle('muted', mudo);
}

function abrirPainel() {
  soundSettingsEl.classList.add('open');
  btnSoundSettings.setAttribute('aria-expanded', 'true');
}

// Toca a animação de saída (saida-pop, ver style.css) antes de sumir de
// verdade — mesmo padrão de closeBotClassSelect/closeOnlineClassSelect.
function fecharPainel() {
  if (!soundSettingsEl.classList.contains('open')) return;
  btnSoundSettings.setAttribute('aria-expanded', 'false');
  soundSettingsPanelEl.classList.add('closing');
  soundSettingsPanelEl.addEventListener('animationend', () => {
    soundSettingsEl.classList.remove('open');
    soundSettingsPanelEl.classList.remove('closing');
  }, { once: true });
}

export function initSoundSettings() {
  if (!soundSettingsEl || !btnSoundSettings || !volumeEfeitosInput || !btnEffectsMute) return;

  const volumeInicial = getEffectsVolume();
  volumeEfeitosInput.value = String(volumeInicial);
  atualizarIcone(volumeInicial, getEffectsMuted());

  btnSoundSettings.addEventListener('click', () => {
    if (soundSettingsEl.classList.contains('open')) fecharPainel();
    else abrirPainel();
  });

  volumeEfeitosInput.addEventListener('input', () => {
    const volume = Number(volumeEfeitosInput.value);
    setEffectsVolume(volume);
    // Ajustar o slider com o som mudo já é um sinal claro de que o jogador
    // quer ouvir de novo — mesmo padrão do mudo de música em music.js.
    if (getEffectsMuted() && volume > 0) setEffectsMuted(false);
    atualizarIcone(volume, getEffectsMuted());
  });

  btnEffectsMute.addEventListener('click', () => {
    setEffectsMuted(!getEffectsMuted());
    atualizarIcone(Number(volumeEfeitosInput.value), getEffectsMuted());
  });

  document.addEventListener('click', (e) => {
    if (!soundSettingsEl.contains(e.target)) fecharPainel();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharPainel();
  });
}
