// Web Audio로 드럼 소리를 합성한다. 샘플 파일 없이 사인파와 노이즈만 쓴다.
let ctx = null;
let master = null;
let noise = null;

export function initAudio() {
  if (ctx) return ctx;
  ctx = new AudioContext({ latencyHint: 'interactive' });
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function envelope(t, peak, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  g.connect(master);
  return g;
}

// 음높이가 f0에서 f1로 떨어지는 북소리
function tone(t, type, f0, f1, sweep, peak, decay) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + sweep);
  osc.connect(envelope(t, peak, decay));
  osc.start(t);
  osc.stop(t + decay);
}

// 필터를 거친 노이즈: 심벌과 스네어의 찰랑거림
function hiss(t, filterType, freq, peak, decay) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  src.connect(filter).connect(envelope(t, peak, decay));
  src.start(t, Math.random());
  src.stop(t + decay);
}

const DRUMS = {
  kick:  (t, v) => { tone(t, 'sine', 150, 45, 0.12, v, 0.35); },
  snare: (t, v) => { hiss(t, 'highpass', 1200, v * 0.7, 0.18); tone(t, 'triangle', 220, 160, 0.05, v * 0.6, 0.12); },
  hihat: (t, v) => { hiss(t, 'highpass', 7000, v * 0.5, 0.06); },
  crash: (t, v) => { hiss(t, 'highpass', 4000, v * 0.5, 1.4); },
  ride:  (t, v) => { hiss(t, 'bandpass', 6000, v * 0.35, 0.6); tone(t, 'square', 3200, 3200, 0.01, v * 0.04, 0.4); },
  tom:   (t, v) => { tone(t, 'sine', 220, 130, 0.15, v * 0.9, 0.3); },
  floor: (t, v) => { tone(t, 'sine', 130, 75, 0.18, v * 0.9, 0.45); },
};

export function play(drum, vel = 0.8) {
  if (!ctx || !DRUMS[drum]) return;
  DRUMS[drum](ctx.currentTime, vel);
}
