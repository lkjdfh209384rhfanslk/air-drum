// 화면 구성과 모듈 연결: 마이크 타격 → 손 위치로 드럼 선택 → 소리.
import { initAudio, play } from './synth.js';
import { startOnset, configOnset, guardOnset } from './onset.js';
import { startPose, hitPoint, setStick } from './pose.js';
import { DRUM_NAMES, LAYOUTS, buildZones, zoneAt } from './kit.js';
import { loadSettings, saveSettings } from './store.js';

const $ = id => document.getElementById(id);
const METER_MAX = 0.6;      // 레벨 막대와 기준 슬라이더의 최대값
const GUARD_SEC = 0.12;
const KNEE_COOLDOWN_MS = 150;
const AIR_COOLDOWN_MS = 120;

const settings = loadSettings();
let zones = [];
let micOn = false;
let camOn = false;
let micLevel = 0;
let fps = 0;
let frames = 0;
let lastHit = '';

// ---- 드럼 구역 ----

function renderZones() {
  zones = buildZones(settings.layout, settings.kickMode === 'zone');
  const box = $('zones');
  box.replaceChildren(...zones.map(z => {
    const el = document.createElement('div');
    el.className = 'zone';
    el.innerHTML = `<div class="pad ${z.drum}"></div><span>${DRUM_NAMES[z.drum]}</span>`;
    el.style.cssText = `left:${z.x * 100}%;top:${z.y * 100}%;width:${z.w * 100}%;height:${z.h * 100}%`;
    // 화면을 직접 눌러도 소리가 난다 (소리 확인용)
    el.addEventListener('pointerdown', () => hit(z, 0.8));
    z.el = el;
    return el;
  }));
  $('stage').classList.toggle('mirror', settings.mirror);
}

function hit(zone, vel, info = '') {
  play(zone.drum, vel);
  guardOnset(settings.guard, GUARD_SEC);
  if (zone.el) {
    zone.el.classList.add('hit');
    setTimeout(() => zone.el.classList.remove('hit'), 90);
  }
  lastHit = `${DRUM_NAMES[zone.drum]} ${info}`;
  renderDebug();
}

const kickZone = () => zones.find(z => z.drum === 'kick') ?? { drum: 'kick' };
const displayX = x => settings.mirror ? 1 - x : x;

// ---- 마이크 타격 ----

function onMicHit({ peak, lowRatio }) {
  const vel = Math.min(1, Math.sqrt(peak));
  const info = `(세기 ${vel.toFixed(2)}, 저음 ${lowRatio.toFixed(2)})`;
  $('last-low').textContent = lowRatio.toFixed(2);

  if (settings.kickMode === 'mic' && lowRatio > settings.kickRatio) return hit(kickZone(), vel, info);
  if (settings.hitMode !== 'mic') return;

  // 손이 안 보이면 스네어로 친다
  const p = camOn ? hitPoint() : null;
  const zone = p ? zoneAt(zones, displayX(p.x), p.y) : null;
  hit(zone ?? zones.find(z => z.drum === 'snare') ?? zones[0], vel, info);
}

function onMicLevel(peak) {
  micLevel = peak;
  const fill = $('level-fill');
  fill.style.width = `${Math.min(1, peak / METER_MAX) * 100}%`;
  fill.classList.toggle('over', peak > settings.thr);
  renderDebug();
}

// ---- 카메라 ----

const knees = { kneeL: { armed: false, last: 0 }, kneeR: { armed: false, last: 0 } };
const air = { handL: { armed: false, peak: 0, last: 0 }, handR: { armed: false, peak: 0, last: 0 } };

// 카메라만 쓰는 방식: 손이 빠르게 내려오다 멈추는 순간을 타격으로 본다
function detectAirHits(points, now) {
  for (const [name, a] of Object.entries(air)) {
    const p = points[name];
    if (!p) { a.armed = false; continue; }
    if (p.vy > settings.airSpeed) {
      a.peak = a.armed ? Math.max(a.peak, p.vy) : p.vy;
      a.armed = true;
    } else if (a.armed && p.vy < settings.airSpeed * 0.2) {
      a.armed = false;
      if (now - a.last < AIR_COOLDOWN_MS) continue;
      a.last = now;
      const zone = zoneAt(zones, displayX(p.x), p.y);
      if (zone) hit(zone, Math.min(1, Math.max(0.3, a.peak / 3)), '(카메라)');
    }
  }
}

function onPoseFrame(points, now) {
  frames++;
  for (const [name, id] of [['handL', 'hand-L'], ['handR', 'hand-R']]) {
    const p = points[name];
    const el = $(id);
    el.classList.toggle('hidden', !p);
    if (p) { el.style.left = `${displayX(p.x) * 100}%`; el.style.top = `${p.y * 100}%`; }
  }

  if (settings.hitMode === 'cam') detectAirHits(points, now);
  if (settings.kickMode !== 'knee') return;
  // 무릎이 빠르게 내려오다 멈추는 순간(발이 바닥에 닿음)을 킥으로 본다
  for (const [name, k] of Object.entries(knees)) {
    const p = points[name];
    if (!p) { k.armed = false; continue; }
    if (p.vy > settings.kneeSpeed) k.armed = true;
    else if (k.armed && p.vy < settings.kneeSpeed * 0.2) {
      k.armed = false;
      if (now - k.last > KNEE_COOLDOWN_MS) { k.last = now; hit(kickZone(), 0.9, '(무릎)'); }
    }
  }
}

setInterval(() => { fps = frames; frames = 0; renderDebug(); }, 1000);

function renderDebug() {
  const parts = [
    micOn ? `마이크 ${micLevel.toFixed(2)}` : '마이크 꺼짐',
    camOn ? `카메라 ${fps}fps` : '카메라 꺼짐',
  ];
  if (lastHit) parts.push(`마지막: ${lastHit}`);
  $('debug').textContent = parts.join(' · ');
}

// ---- 설정 ----

const SLIDERS = {
  thr: v => v.toFixed(2),
  refractoryMs: v => `${v}ms`,
  guard: v => v.toFixed(2),
  airSpeed: v => v.toFixed(2),
  stick: v => v.toFixed(1),
  kickRatio: v => v.toFixed(2),
  kneeSpeed: v => v.toFixed(2),
};

function applySettings() {
  configOnset(settings.thr, settings.refractoryMs / 1000);
  setStick(settings.stick);
  $('level-line').style.left = `${settings.thr / METER_MAX * 100}%`;
  renderZones();
  saveSettings(settings);
}

function initSettings() {
  $('layout').replaceChildren(...Object.entries(LAYOUTS).map(([id, l]) => new Option(l.name, id)));

  for (const [key, fmt] of Object.entries(SLIDERS)) {
    const input = $(key);
    const show = () => { $(`${key}-out`).textContent = fmt(settings[key]); };
    input.value = settings[key];
    show();
    input.addEventListener('input', () => { settings[key] = Number(input.value); show(); applySettings(); });
  }
  for (const key of ['hitMode', 'layout', 'kickMode']) {
    $(key).value = settings[key];
    $(key).addEventListener('change', () => { settings[key] = $(key).value; applySettings(); });
  }
  $('mirror').checked = settings.mirror;
  $('mirror').addEventListener('change', () => { settings.mirror = $('mirror').checked; applySettings(); });
  $('echoCancel').checked = settings.echoCancel;
  $('echoCancel').addEventListener('change', () => {
    settings.echoCancel = $('echoCancel').checked;
    saveSettings(settings);
    if (micOn) location.reload(); // 마이크를 새 조건으로 다시 열어야 한다
  });

  $('open-settings').addEventListener('click', () => $('settings').classList.remove('hidden'));
  $('close-settings').addEventListener('click', () => $('settings').classList.add('hidden'));
}

// ---- 시작 ----

async function getMedia(constraints) {
  try { return await navigator.mediaDevices.getUserMedia(constraints); } catch { return null; }
}

async function start() {
  const msg = $('start-msg');
  $('start-btn').disabled = true;

  const ctx = initAudio();
  await ctx.resume();
  // iOS: 마이크를 켠 채로 스피커 음량이 줄지 않게 한다
  if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';

  // 지연을 줄이려고 마이크의 자동 보정은 기본으로 모두 끈다
  const audio = { echoCancellation: settings.echoCancel, noiseSuppression: false, autoGainControl: false };
  const video = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } };

  msg.textContent = '마이크와 카메라를 여는 중…';
  let stream = await getMedia({ audio, video });
  // 둘 중 하나만 허용되거나 없는 경우에도 가능한 것만으로 동작한다
  const micStream = stream ?? await getMedia({ audio });
  const camStream = stream ?? await getMedia({ video });

  if (micStream?.getAudioTracks().length) {
    await startOnset(ctx, micStream, onMicHit, onMicLevel);
    micOn = true;
  }

  $('start').classList.add('hidden');
  applySettings();
  renderDebug();

  if (camStream?.getVideoTracks().length) {
    const cam = $('cam');
    cam.srcObject = new MediaStream(camStream.getVideoTracks());
    await cam.play();
    $('stage').style.setProperty('--ar', cam.videoWidth / cam.videoHeight);
    $('debug').textContent = '동작 인식 모델을 불러오는 중…';
    try {
      await startPose(cam, onPoseFrame);
      camOn = true;
    } catch (err) {
      console.error(err);
    }
    renderDebug();
  }
}

initSettings();
renderZones();
$('start-btn').addEventListener('click', () => {
  start().catch(err => {
    console.error(err);
    $('start-msg').textContent = `시작하지 못했습니다: ${err.message}`;
    $('start-btn').disabled = false;
  });
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
