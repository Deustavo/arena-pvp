// Efeitos sonoros do jogo. Tudo é sintetizado na hora com a Web Audio API —
// nenhum arquivo de áudio, nenhuma dependência.
//
// Este módulo é só a camada de síntese: quem sabe *quando* tocar é quem já
// conhece o evento (hud.js para dano/escudo, explosions.js para a explosão,
// matchTimer.js para o cronômetro, etc.).

const VOLUME_MASTER = 0.7;
const VOLUME_EFEITOS_KEY = 'jogoDoAno.volumeEfeitos';

function lerVolumeEfeitosSalvo() {
  const salvo = localStorage.getItem(VOLUME_EFEITOS_KEY);
  if (salvo === null) return 50;
  const bruto = Number(salvo);
  return Number.isFinite(bruto) && bruto >= 0 && bruto <= 100 ? bruto : 50;
}

// Controle de volume dos efeitos (0-100), aplicado como multiplicador sobre
// o `master` (bus de todos os efeitos). Guardado à parte de `VOLUME_MASTER`
// para não perder o balanceamento relativo entre efeitos já ajustado ali.
// Música (quando existir) terá seu próprio bus e seu próprio controle — não
// deve passar por este `master`.
let volumeEfeitos = lerVolumeEfeitosSalvo();

// Mudo é um estado à parte do volume: silencia o bus sem mexer no valor do
// slider, pra restaurar o volume de antes ao desmutar (mesmo padrão do mudo
// de música em music.js).
let mutadoEfeitos = false;

let audioCtx = null;
let master = null;
let ruidoBuffer = null;

// Um único contexto para todo o jogo, criado no primeiro efeito e nunca
// fechado: um contexto por som estoura o limite do navegador (~6 ativos) assim
// que os sons de combate começam, e criar contexto custa alguns ms.
//
// Devolve null enquanto o navegador não liberou o áudio (antes do primeiro
// gesto do usuário). Isso é de propósito: num contexto suspenso o tempo não
// corre, então tudo o que fosse agendado ficaria na fila e tocaria de uma vez
// quando ele fosse liberado.
function ctx() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioCtx = new AudioCtx();
    master = audioCtx.createGain();
    master.gain.value = mutadoEfeitos ? 0 : VOLUME_MASTER * (volumeEfeitos / 100);
    master.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx.state === 'running' ? audioCtx : null;
}

// --- Volume ------------------------------------------------------------

export function getEffectsVolume() {
  return volumeEfeitos;
}

// `pct` é 0-100. Persiste em localStorage para valer entre visitas, e aplica
// na hora se o contexto já existir (efeito toca no volume novo sem precisar
// de outro gesto do usuário).
export function setEffectsVolume(pct) {
  volumeEfeitos = Math.min(100, Math.max(0, Math.round(pct)));
  try {
    localStorage.setItem(VOLUME_EFEITOS_KEY, String(volumeEfeitos));
  } catch {
    // localStorage indisponível: a preferência só vale para esta sessão.
  }
  if (master) master.gain.value = mutadoEfeitos ? 0 : VOLUME_MASTER * (volumeEfeitos / 100);
}

export function getEffectsMuted() {
  return mutadoEfeitos;
}

export function setEffectsMuted(mudo) {
  mutadoEfeitos = mudo;
  if (master) master.gain.value = mutadoEfeitos ? 0 : VOLUME_MASTER * (volumeEfeitos / 100);
}

// Envelope attack/decay exponencial. Nunca chega a zero porque
// exponentialRampToValueAtTime não aceita 0.
function envelope(gainNode, t0, dur, pico, attack = 0.005) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(pico, t0 + Math.min(attack, dur / 2));
  g.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

// Uma nota, com sweep opcional de frequência (`to`).
function nota(o) {
  const c = ctx();
  if (!c) return;
  const dur = o.dur ?? 0.1;
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type || 'square';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  if (o.detune) osc.detune.value = o.detune;
  envelope(g, t0, dur, o.gain ?? 0.15, o.attack);
  osc.connect(g);
  let saida = g;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = o.filter;
    f.frequency.value = o.filterFreq ?? 1000;
    if (o.Q) f.Q.value = o.Q;
    g.connect(f);
    saida = f;
  }
  saida.connect(o.dest || master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Rajada de ruído branco. É a rampa da frequência de corte do filtro que dá
// "material" ao ruído (estouro, metal, ar).
function ruido(o = {}) {
  const c = ctx();
  if (!c) return;
  const dur = o.dur ?? 0.1;
  const t0 = c.currentTime + (o.at ?? 0);
  if (!ruidoBuffer) {
    ruidoBuffer = c.createBuffer(1, Math.floor(c.sampleRate * 2), c.sampleRate);
    const dados = ruidoBuffer.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = ruidoBuffer;
  src.loop = true;
  const g = c.createGain();
  envelope(g, t0, dur, o.gain ?? 0.15, o.attack ?? 0.002);
  let node = src;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = o.filter;
    f.frequency.setValueAtTime(o.from ?? 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    if (o.Q) f.Q.value = o.Q;
    src.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(o.dest || master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// Sequência de notas (jingle/arpejo). Cada nota entra quando a anterior acaba.
function sequencia(notas, base = {}) {
  let at = base.at ?? 0;
  for (const n of notas) {
    nota({ ...base, ...n, at });
    at += n.dur ?? base.dur ?? 0.1;
  }
}

// Dois eventos de jogo podem cair no mesmo tick (os dois jogadores perdendo um
// coração no desempate, os 3 projéteis do mago batendo no escudo). Tocar o
// mesmo efeito sobreposto satura o áudio, então cada efeito ignora repetições
// dentro da sua própria janela.
const ultimoToque = new Map();

function podeTocar(id, janelaMs) {
  const agora = performance.now();
  const anterior = ultimoToque.get(id);
  if (anterior !== undefined && agora - anterior < janelaMs) return false;
  ultimoToque.set(id, agora);
  return true;
}

// Fábrica dos efeitos exportados: aplica a janela anti-repetição e engole
// qualquer erro de áudio (navegador sem Web Audio, contexto bloqueado, etc.) —
// som nunca pode atrapalhar a partida.
function efeito(id, janelaMs, toca) {
  return (...args) => {
    if (!podeTocar(id, janelaMs)) return;
    try {
      toca(...args);
    } catch {
      // Áudio indisponível — falha em silêncio, literalmente.
    }
  };
}

// --- Combate ---------------------------------------------------------------

// Tiro. É o mesmo som para todas as classes, de propósito: é o efeito mais
// repetido da partida, então precisa ser curto e discreto (sweep agudo de 50ms)
// para não cansar.
export const playShotSound = efeito('shot', 30, () => {
  nota({ type: 'square', freq: 1400, to: 700, dur: 0.05, gain: 0.1 });
});

// Levou dano. É a informação mais importante do jogo, então é o efeito mais
// alto do combate. Também é o som de cada coração drenado no desempate.
export const playHitSound = efeito('hit', 40, () => {
  nota({ type: 'square', freq: 160, to: 110, dur: 0.08, gain: 0.28 });
  ruido({ dur: 0.06, filter: 'lowpass', from: 800, to: 300, gain: 0.2 });
});

// Escudo bloqueou o tiro. Timbre metálico (duas frequências em razão não
// harmônica), bem diferente do dano — o jogador precisa saber, de ouvido, se
// perdeu vida ou não.
export const playShieldBlockSound = efeito('shieldBlock', 40, () => {
  nota({ type: 'sine', freq: 1200, dur: 0.15, gain: 0.2, filter: 'bandpass', filterFreq: 2000, Q: 1.5 });
  nota({ type: 'sine', freq: 1830, dur: 0.15, gain: 0.14, filter: 'bandpass', filterFreq: 2000, Q: 1.5 });
});

// Escudo erguido (campo de força ligando).
export const playShieldUpSound = efeito('shieldUp', 120, () => {
  nota({ type: 'sine', freq: 200, to: 600, dur: 0.18, gain: 0.16, attack: 0.02 });
});

// Última carga de escudo gasta: o bloqueio ainda aconteceu, mas não haverá
// outro. Toca no lugar do playShieldBlockSound nesse hit.
export const playShieldBreakSound = efeito('shieldBreak', 120, () => {
  ruido({ dur: 0.3, filter: 'bandpass', from: 3000, to: 600, Q: 3, gain: 0.28 });
});

// Tiro passou raspando sem acertar.
export const playNearMissSound = efeito('nearMiss', 250, () => {
  const c = ctx();
  if (!c) return;
  const pan = c.createStereoPanner();
  pan.pan.setValueAtTime(-1, c.currentTime);
  pan.pan.linearRampToValueAtTime(1, c.currentTime + 0.15);
  pan.connect(master);
  ruido({ dur: 0.15, filter: 'bandpass', from: 1500, to: 1500, Q: 6, gain: 0.22, dest: pan });
});

// Ação recusada: escudo esgotado, tiro em cooldown ou tiro durante a defesa.
// A janela é longa porque o keydown repete enquanto a tecla fica pressionada.
export const playUnavailableSound = efeito('unavailable', 500, () => {
  nota({ type: 'triangle', freq: 150, dur: 0.05, gain: 0.08 });
});

// --- Fim de partida --------------------------------------------------------

// Um jogador zerou as vidas. Casa com as partículas de explosions.js.
export const playExplosionSound = efeito('explosion', 80, () => {
  ruido({ dur: 0.6, filter: 'lowpass', from: 1200, to: 60, gain: 0.4 });
  nota({ type: 'sawtooth', freq: 70, to: 30, dur: 0.5, gain: 0.25 });
});

export const playVictorySound = efeito('victory', 1000, () => {
  sequencia(
    [{ freq: 523.25 }, { freq: 659.25 }, { freq: 784 }, { freq: 1046.5, dur: 0.4 }],
    { type: 'square', dur: 0.1, gain: 0.18 },
  );
});

// Serve para derrota e para empate: nos dois casos o jogador não ganhou.
export const playDefeatSound = efeito('defeat', 1000, () => {
  sequencia(
    [
      { freq: 392, to: 370 },
      { freq: 329.63, to: 310 },
      { freq: 261.63, to: 245 },
      { freq: 196, to: 160, dur: 0.45 },
    ],
    { type: 'sawtooth', dur: 0.14, gain: 0.16 },
  );
});

// --- Cronômetro ------------------------------------------------------------

// Tique dos últimos segundos do tempo regulamentar. Sobe de tom conforme o
// tempo acaba, então a tensão cresce sem precisar aumentar o volume.
export const playTimerTickSound = efeito('timerTick', 200, (segundosRestantes) => {
  const passos = Math.max(0, 10 - segundosRestantes);
  ruido({ dur: 0.02, filter: 'highpass', from: 2000 + passos * 400, gain: 0.1 + passos * 0.015 });
});

// Aviso de tempo restante (30 segundos) — mais urgente porque é o último
// aviso antes dos tiques finais de `playTimerTickSound`.
export const playTimeWarningSound = efeito('timeWarning', 500, () => {
  sequencia([{ freq: 880 }, { freq: 880 }], { type: 'sine', dur: 0.12, gain: 0.18 });
});

// Tempo esgotado com os dois vivos: a partida congela e começa o desempate.
export const playSuddenDeathSound = efeito('suddenDeath', 1000, () => {
  sequencia(
    [{ freq: 330 }, { freq: 247 }, { freq: 330 }, { freq: 247 }],
    { type: 'sawtooth', dur: 0.15, gain: 0.2 },
  );
});

// --- Menu, matchmaking e UI ------------------------------------------------

export const playHoverSound = efeito('hover', 60, () => {
  nota({ type: 'sine', freq: 900, dur: 0.03, gain: 0.05 });
});

export const playClickSound = efeito('click', 60, () => {
  sequencia([{ freq: 700 }, { freq: 1100 }], { type: 'square', dur: 0.025, gain: 0.12 });
});

// Oponente encontrado, antes da contagem regressiva.
export const playMatchFoundSound = efeito('matchFound', 500, () => {
  sequencia([{ freq: 784, dur: 0.08 }, { freq: 1046.5, dur: 0.2 }], { type: 'square', gain: 0.18 });
});

// Beep curto tocado a cada segundo da contagem regressiva de "partida encontrada".
export const playCountdownBeep = efeito('countdown', 200, () => {
  nota({ type: 'square', freq: 523.25, dur: 0.1, gain: 0.2 });
});

// Jingle de início de partida: duas notas curtas subindo em tom, estilo "power-up" de arcade.
export const playStartSound = efeito('start', 500, () => {
  sequencia([{ freq: 659.25, dur: 0.11 }, { freq: 987.77, dur: 0.25 }], { type: 'square', gain: 0.2 });
});

// Bipe curto e agudo tocado quando o jogador completa um passo do tutorial
// interativo da primeira partida.
export const playTutorialStepSound = efeito('tutorialStep', 200, () => {
  sequencia([{ freq: 784, dur: 0.07 }, { freq: 1174.66, dur: 0.12 }], { type: 'square', gain: 0.2 });
});

// Último passo do tutorial: mesma família do passo, com uma nota extra.
export const playTutorialCompleteSound = efeito('tutorialComplete', 1000, () => {
  sequencia(
    [{ freq: 784 }, { freq: 987.77 }, { freq: 1174.66 }, { freq: 1568, dur: 0.4 }],
    { type: 'square', dur: 0.07, gain: 0.18 },
  );
});

export const playFormErrorSound = efeito('formError', 500, () => {
  sequencia([{ freq: 300 }, { freq: 200 }], { type: 'square', dur: 0.06, gain: 0.14 });
});

// Baforada leve quando o mouse acende uma letra do título — ruído filtrado
// em queda, mais discreto que o resto da UI porque acontece toda vez que o
// mouse passa por cima de uma letra (efeito frequente e só decorativo).
export const playTitleFireSound = efeito('titleFire', 150, () => {
  ruido({ dur: 0.15, filter: 'bandpass', from: 2200, to: 500, Q: 1, gain: 0.1 });
});

export const playFormSuccessSound = efeito('formSuccess', 500, () => {
  sequencia(
    [{ freq: 523.25 }, { freq: 659.25 }, { freq: 880, dur: 0.18 }],
    { type: 'triangle', dur: 0.06, gain: 0.16 },
  );
});
