// 마이크 → AudioWorklet 연결. 타격과 마이크 레벨을 콜백으로 넘긴다.
let node = null;
let source = null;

export async function startOnset(ctx, stream, onHit, onLevel) {
  await ctx.audioWorklet.addModule(new URL('./onset-worklet.js', import.meta.url).href);
  node = new AudioWorkletNode(ctx, 'onset');
  source = ctx.createMediaStreamSource(stream);
  source.connect(node);

  // 출력이 어디에도 이어지지 않으면 처리를 멈추는 브라우저가 있어 음량 0으로 연결해 둔다
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute).connect(ctx.destination);

  node.port.onmessage = e => {
    if (e.data.type === 'hit') onHit(e.data);
    else if (e.data.type === 'level') onLevel(e.data.peak);
  };
}

export function configOnset(thr, refractory) {
  node?.port.postMessage({ type: 'config', thr, refractory });
}

export function guardOnset(level, sec) {
  if (level > 0) node?.port.postMessage({ type: 'guard', level, sec });
}
