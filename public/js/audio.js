function getAudioCtx() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  return new AudioCtx();
}

// Toca uma nota (onda quadrada, estilo chiptune/arcade) num contexto e horário
// dados, para permitir encadear várias notas num mesmo áudio.
function scheduleNote(audioCtx, frequency, startTime, durationSec) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.05);
  return osc;
}

// Beep curto tocado a cada segundo da contagem regressiva de "partida encontrada".
export function playCountdownBeep() {
  try {
    const audioCtx = getAudioCtx();
    const osc = scheduleNote(audioCtx, 523.25, audioCtx.currentTime, 0.1);
    osc.onended = () => audioCtx.close();
  } catch {
    // Audio unavailable (e.g. no user interaction yet) — fail silently.
  }
}

// Jingle de início de partida: duas notas curtas subindo em tom, estilo "power-up" de arcade.
export function playStartSound() {
  try {
    const audioCtx = getAudioCtx();
    const now = audioCtx.currentTime;
    scheduleNote(audioCtx, 659.25, now, 0.1);
    const last = scheduleNote(audioCtx, 987.77, now + 0.11, 0.25);
    last.onended = () => audioCtx.close();
  } catch {
    // Audio unavailable (e.g. no user interaction yet) — fail silently.
  }
}
