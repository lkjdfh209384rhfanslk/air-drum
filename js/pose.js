// 카메라 + MediaPipe Pose Landmarker. 양손(스틱 끝)과 무릎의 위치·세로 속도를 계속 갱신한다.
import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

// 손은 손목 → 검지 방향으로 더 뻗은 지점을 스틱 끝으로 본다
const POINTS = {
  handL: { tip: 19, base: 15, minVis: 0.15 },
  handR: { tip: 20, base: 16, minVis: 0.15 },
  kneeL: { tip: 25, minVis: 0.4 },
  kneeR: { tip: 26, minVis: 0.4 },
};
const HISTORY_MS = 250;
const STILL_SPEED = 0.3;   // 이보다 느리면 가만히 있는 손으로 본다 (화면 높이/초)
const LAST_SEEN_MS = 3000; // 가려진 손의 마지막 위치를 기억하는 시간

let landmarker = null;
let running = false;
let stick = 1;
const history = Object.fromEntries(Object.keys(POINTS).map(k => [k, []]));
const lastSeen = {};

export function setStick(length) { stick = length; }

export async function startPose(video, onFrame) {
  if (running) return;
  running = true;

  if (!landmarker) {
    const fileset = await FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm', import.meta.url).href);
    const options = {
      baseOptions: { modelAssetPath: new URL('../vendor/mediapipe/pose_landmarker_lite.task', import.meta.url).href, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    };
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, options);
    } catch {
      options.baseOptions.delegate = 'CPU';
      landmarker = await PoseLandmarker.createFromOptions(fileset, options);
    }
  }

  // 새 영상 프레임이 올 때만 인식한다 (지원하지 않으면 화면 갱신마다)
  const schedule = video.requestVideoFrameCallback
    ? fn => video.requestVideoFrameCallback(fn)
    : fn => requestAnimationFrame(fn);

  const tick = () => {
    if (!running) return;
    if (video.readyState >= 2) {
      const now = performance.now();
      onFrame(update(landmarker.detectForVideo(video, now), now), now);
    }
    schedule(tick);
  };
  schedule(tick);
}

function update(result, now) {
  const lm = result.landmarks?.[0];
  const out = {};
  for (const [name, def] of Object.entries(POINTS)) {
    const h = history[name];
    while (h.length && now - h[0].t > HISTORY_MS) h.shift();

    const tip = lm?.[def.tip];
    if (!tip || (tip.visibility ?? 1) < def.minVis) { out[name] = null; continue; }

    let { x, y } = tip;
    const base = def.base !== undefined && lm[def.base];
    if (base) { x += (tip.x - base.x) * stick; y += (tip.y - base.y) * stick; }

    // 두 프레임 전과 비교해 떨림을 줄인 세로 속도 (화면 높이/초, 아래쪽이 +)
    const ref = h[h.length - 2] ?? h[h.length - 1];
    const vy = ref ? (y - ref.y) / ((now - ref.t) / 1000) : 0;
    h.push({ x, y, vy, t: now });
    lastSeen[name] = { x, y, t: now };
    out[name] = { x, y, vy };
  }
  return out;
}

// 방금 친 손의 위치: 최근에 아래로 가장 빠르게 움직인 손.
// 보이는 손이 가만히 있었다면, 물건에 가려진 반대쪽 손이 친 것으로 보고 그 손의 마지막 위치를 쓴다.
export function hitPoint() {
  const now = performance.now();
  let best = null, bestV = -Infinity, hidden = null;
  for (const name of ['handL', 'handR']) {
    const h = history[name].filter(s => now - s.t <= HISTORY_MS);
    if (!h.length) {
      const seen = lastSeen[name];
      if (seen && now - seen.t <= LAST_SEEN_MS) hidden = seen;
      continue;
    }
    const v = Math.max(...h.map(s => s.vy));
    if (v > bestV) { bestV = v; best = h[h.length - 1]; }
  }
  if (hidden && bestV < STILL_SPEED) best = hidden;
  return best && { x: best.x, y: best.y };
}
