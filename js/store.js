// 설정(localStorage) 저장.
const SETTINGS_KEY = 'air-drum-settings';
const DEFAULTS = {
  thr: 0.12,            // 타격으로 보는 마이크 진폭 기준
  refractoryMs: 60,     // 한 번 친 뒤 다시 감지하기까지의 최소 간격
  guard: 0.15,          // 소리를 낸 직후 잠깐 올리는 기준값 (스피커 되울림 방지)
  echoCancel: false,
  layout: 'row',
  kickMode: 'none',     // none | mic | knee | zone
  kickRatio: 0.35,      // 발 소리 방식: 저음 비율이 이 값을 넘으면 킥
  kneeSpeed: 0.25,      // 무릎 방식: 무릎이 내려오는 속도 기준 (화면 높이/초)
  mirror: true,
};

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 저장 실패해도 동작은 유지 */ }
}
