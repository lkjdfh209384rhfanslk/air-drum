// 마이크 입력에서 타격 순간을 찾는다. 블록(128샘플, 약 2.7ms) 단위로 최대 진폭을 본다.
const COLLECT_BLOCKS = 3;   // 타격 후 약 8ms를 모아 세기와 저음 비율을 잰다
const RISE = 1.8;           // 직전 울림보다 이만큼 커야 새 타격으로 본다
const ENV_DECAY = 0.9;
const LEVEL_INTERVAL = 0.05;

class OnsetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thr = 0.1;
    this.refractory = 0.06;
    this.guardLevel = 0;
    this.guardUntil = 0;

    this.env = 0;
    this.blockedUntil = 0;
    this.collect = 0;
    this.peak = 0;
    this.total = 0;
    this.low = 0;

    this.dc = 0;
    this.lp = 0;
    this.dcCoef = 1 - Math.exp(-2 * Math.PI * 30 / sampleRate);
    this.lpCoef = 1 - Math.exp(-2 * Math.PI * 150 / sampleRate);

    this.levelPeak = 0;
    this.levelNext = 0;

    this.port.onmessage = e => {
      const d = e.data;
      if (d.type === 'config') {
        this.thr = d.thr;
        this.refractory = d.refractory;
      } else if (d.type === 'guard') {
        // 방금 스피커로 낸 소리가 되돌아와 타격으로 잡히지 않게 잠깐 기준값을 올린다
        this.guardLevel = d.level;
        this.guardUntil = currentTime + d.sec;
      }
    };
  }

  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;

    let peak = 0, total = 0, low = 0;
    for (let i = 0; i < ch.length; i++) {
      this.dc += this.dcCoef * (ch[i] - this.dc);
      const s = ch[i] - this.dc;
      this.lp += this.lpCoef * (s - this.lp);
      const a = Math.abs(s);
      if (a > peak) peak = a;
      total += s * s;
      low += this.lp * this.lp;
    }

    if (this.collect > 0) {
      this.accumulate(peak, total, low);
      if (--this.collect === 0) this.emit();
    } else {
      const thr = currentTime < this.guardUntil ? Math.max(this.thr, this.guardLevel) : this.thr;
      if (currentTime >= this.blockedUntil && peak > thr && peak > this.env * RISE) {
        this.peak = 0; this.total = 0; this.low = 0;
        this.accumulate(peak, total, low);
        this.collect = COLLECT_BLOCKS - 1;
        this.blockedUntil = currentTime + this.refractory;
      }
    }
    this.env = Math.max(peak, this.env * ENV_DECAY);

    if (peak > this.levelPeak) this.levelPeak = peak;
    if (currentTime >= this.levelNext) {
      this.port.postMessage({ type: 'level', peak: this.levelPeak });
      this.levelPeak = 0;
      this.levelNext = currentTime + LEVEL_INTERVAL;
    }
    return true;
  }

  accumulate(peak, total, low) {
    if (peak > this.peak) this.peak = peak;
    this.total += total;
    this.low += low;
  }

  emit() {
    this.port.postMessage({ type: 'hit', peak: this.peak, lowRatio: this.total > 0 ? this.low / this.total : 0 });
  }
}

registerProcessor('onset', OnsetProcessor);
