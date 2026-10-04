// 카메라 + MediaPipe Pose Landmarker. 양손 끝과 무릎의 위치·세로 속도를 계속 갱신한다.
import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

// 손목보다 타격 지점에 가까운 검지 쪽 점을 쓴다
const POINTS = { handL: 19, handR: 20, kneeL: 25, kneeR: 26 };
const MIN_VISIBILITY = 0.4;
const HISTORY_MS = 250;

let landmarker = null;
let running = false;
const history = Object.fromEntries(Object.keys(POINTS).map(k => [k, []]));

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
  for (const [name, idx] of Object.entries(POINTS)) {
    const h = history[name];
    while (h.length && now - h[0].t > HISTORY_MS) h.shift();

    const p = lm?.[idx];
    if (!p || (p.visibility ?? 1) < MIN_VISIBILITY) { out[name] = null; continue; }

    // 두 프레임 전과 비교해 떨림을 줄인 세로 속도 (화면 높이/초, 아래쪽이 +)
    const ref = h[h.length - 2] ?? h[h.length - 1];
    const vy = ref ? (p.y - ref.y) / ((now - ref.t) / 1000) : 0;
    h.push({ x: p.x, y: p.y, vy, t: now });
    out[name] = { x: p.x, y: p.y, vy };
  }
  return out;
}

// 방금 친 손의 위치: 최근에 아래로 가장 빠르게 움직인 손. 보이는 손이 없으면 null.
export function hitPoint() {
  const now = performance.now();
  let best = null, bestV = -Infinity;
  for (const name of ['handL', 'handR']) {
    const h = history[name].filter(s => now - s.t <= HISTORY_MS);
    if (!h.length) continue;
    const v = Math.max(...h.map(s => s.vy));
    if (v > bestV) { bestV = v; best = h[h.length - 1]; }
  }
  return best && { x: best.x, y: best.y };
}
