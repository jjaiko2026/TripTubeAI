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

/**
 * 하루 안에서 좌표가 있는 항목들의 순서를 지리적으로 자연스러운 동선에 가깝게 재배열합니다.
 * 좌표 없는 항목은 원래 위치를 유지합니다. AI가 시간순으로 부여한 time 값은 재정렬된
 * 순서에 맞춰 오름차순으로 다시 배분해, 화면상 시간 표기가 뒤죽박죽 보이지 않게 합니다.
 */
export function reorderDayItemsByGeography(items: ItineraryItem[]): ItineraryItem[] {
  const locatedIdx = items
    .map((it, i) => (it.location ? i : -1))
    .filter((i): i is number => i >= 0);

  if (locatedIdx.length < 3) return items;

  const points = locatedIdx.map((i) => items[i].location!);
  const order = optimizeLocationOrder(points);

  const result = [...items];
  order.forEach((originalPos, newPos) => {
    result[locatedIdx[newPos]] = items[locatedIdx[originalPos]];
  });

  const timesAscending = items.map((it) => it.time).sort();
  return result.map((it, i) => ({ ...it, time: timesAscending[i] }));
}
