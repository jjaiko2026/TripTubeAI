import type { GeoLocation, ItineraryItem } from "@/lib/types";

/** 두 좌표 사이의 대권거리(great-circle distance)를 미터 단위로 계산합니다. */
export function haversineMeters(a: GeoLocation, b: GeoLocation): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function haversineDistance(a: GeoLocation, b: GeoLocation): number {
  return haversineMeters(a, b) / 1000;
}

/**
 * 첫 번째와 마지막 지점(보통 하루의 시작/숙소 앵커)은 고정한 채, 그 사이 지점들만
 * 최근접 이웃으로 초기 경로를 만들고 2-opt로 교차를 제거해 지그재그를 줄입니다.
 */
function optimizeLocationOrder(points: GeoLocation[]): number[] {
  const n = points.length;
  const order = points.map((_, i) => i);
  if (n <= 3) return order;

  const startIdx = 0;
  const endIdx = n - 1;
  const pool = order.slice(1, -1);

  const nn: number[] = [];
  let current = startIdx;
  while (pool.length > 0) {
    let bestI = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const d = haversineDistance(points[current], points[pool[i]]);
      if (d < bestDist) {
        bestDist = d;
        bestI = i;
      }
    }
    current = pool[bestI];
    nn.push(current);
    pool.splice(bestI, 1);
  }

  let route = [startIdx, ...nn, endIdx];

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 2; i++) {
      for (let j = i + 1; j < route.length - 1; j++) {
        const a = points[route[i - 1]];
        const b = points[route[i]];
        const c = points[route[j]];
        const d = points[route[j + 1]];
        const before = haversineDistance(a, b) + haversineDistance(c, d);
        const after = haversineDistance(a, c) + haversineDistance(b, d);
        if (after + 1e-9 < before) {
          route = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
          improved = true;
        }
      }
    }
  }

  return route;
}

const DWELL_MINUTES = 90;
const MINUTES_PER_KM = 3; // 약 시속 20km 블렌디드(도보+택시/대중교통) 이동 속도 가정
const TRAVEL_MIN_FLOOR_MINUTES = 10;
const TRAVEL_MAX_CAP_MINUTES = 120;
// 좌표가 없어 실거리를 못 구하는 구간(둘 중 하나라도 좌표 없음)에 쓰는 기본 이동 시간.
const DEFAULT_TRAVEL_MINUTES = 20;

function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.round(totalMinutes));
  const hours = Math.min(23, Math.floor(clamped / 60));
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function travelMinutesBetween(a: GeoLocation | null, b: GeoLocation | null): number {
  if (!a || !b) return DEFAULT_TRAVEL_MINUTES;
  const km = haversineDistance(a, b);
  return Math.min(TRAVEL_MAX_CAP_MINUTES, Math.max(TRAVEL_MIN_FLOOR_MINUTES, Math.round(km * MINUTES_PER_KM)));
}

/**
 * 화면에 보이는 순서(동선)에 맞춰 시각을 다시 계산합니다. 첫 항목의 시각(하루 시작)만 그대로
 * 두고, 이후 각 항목은 이전 항목에서의 체류 시간(DWELL_MINUTES)과 다음 지점까지 실제 거리
 * 기반 이동 시간을 더해 정합니다. 지리적으로 재배열한 뒤에도 AI가 원래 배정한 시각을 그대로
 * 재사용하면(단순 오름차순 재배분) 동선과 안 맞는 시간 간격이 나올 수 있어, 매번 새로 계산합니다.
 */
function rescheduleByDistance(items: ItineraryItem[]): ItineraryItem[] {
  if (items.length === 0) return items;

  let cursor = parseTimeToMinutes(items[0].time) ?? 9 * 60;

  return items.map((item, i) => {
    if (i === 0) return { ...item, time: formatMinutesToTime(cursor) };
    cursor += DWELL_MINUTES + travelMinutesBetween(items[i - 1].location, item.location);
    return { ...item, time: formatMinutesToTime(cursor) };
  });
}

/**
 * 하루 안에서 좌표가 있는 항목들의 순서를 지리적으로 자연스러운 동선에 가깝게 재배열합니다.
 * 좌표 없는 항목은 원래 위치를 유지합니다.
 */
export function reorderDayItemsByGeography(items: ItineraryItem[]): ItineraryItem[] {
  const locatedIdx = items
    .map((it, i) => (it.location ? i : -1))
    .filter((i): i is number => i >= 0);

  if (locatedIdx.length < 3) return rescheduleByDistance(items);

  const points = locatedIdx.map((i) => items[i].location!);
  const order = optimizeLocationOrder(points);

  const result = [...items];
  order.forEach((originalPos, newPos) => {
    result[locatedIdx[newPos]] = items[locatedIdx[originalPos]];
  });

  return rescheduleByDistance(result);
}
