// 드럼 구역 배치와 "좌표 → 드럼" 판정. 좌표는 화면에 보이는 기준 0~1 (왼쪽 위가 0,0).
export const DRUM_NAMES = {
  kick: '킥', snare: '스네어', hihat: '하이햇', crash: '크래시', ride: '라이드', tom: '탐', floor: '플로어 탐',
};

// 책상처럼 평평한 곳을 치면 손 높이가 다 같아서, 기본은 가로 한 줄이다
export const LAYOUTS = {
  row:  { name: '가로 한 줄 (4칸)', rows: [['hihat', 'snare', 'tom', 'crash']] },
  grid: { name: '두 줄 (6칸)', rows: [['crash', 'tom', 'ride'], ['hihat', 'snare', 'floor']] },
};

const KICK_STRIP = 0.25; // 킥 구역을 쓸 때 화면 아래쪽에서 차지하는 높이

export function buildZones(layoutId, kickZone) {
  const rows = (LAYOUTS[layoutId] ?? LAYOUTS.row).rows;
  const height = kickZone ? 1 - KICK_STRIP : 1;
  const zones = [];
  rows.forEach((row, r) => row.forEach((drum, c) => {
    zones.push({ drum, x: c / row.length, y: r / rows.length * height, w: 1 / row.length, h: height / rows.length });
  }));
  if (kickZone) zones.push({ drum: 'kick', x: 0, y: height, w: 1, h: KICK_STRIP });
  return zones;
}

export function zoneAt(zones, x, y) {
  x = Math.min(0.999, Math.max(0, x));
  y = Math.min(0.999, Math.max(0, y));
  return zones.find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) ?? null;
}
