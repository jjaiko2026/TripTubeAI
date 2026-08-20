"use client";

import { useEffect, useRef, useState } from "react";
import { resolveMapProvider } from "@/components/itinerary/map-providers/resolver";
import type { MapInstance, Stop } from "@/components/itinerary/map-providers/types";
import type { PlaceWithDetails } from "@/db/queries";

/**
 * PHASE 3-L-3 — /places 지도. 기존 itinerary 지도 엔진(map-providers/types.ts, resolver.ts,
 * naver-map-provider.ts, google-map-provider.ts)을 그대로 재사용한다 — 전부 무수정.
 * 그 엔진은 "일차별 그룹"(Stop[][])만 알 뿐 "여행 일정"이라는 개념 자체는 모르므로,
 * 여기서는 일차 대신 TourAPI contentTypeId(관광지/문화시설/음식점)를 그룹 단위로 재사용한다.
 *
 * 좌표 정책(PHASE3K §5.3): isCoordinateReliable() === true 인 place만 지도에 올린다.
 * false인 place는 지도에서 제외할 뿐, 좌표를 보정하지 않는다 — 원본 lat/lng은 places
 * 테이블에서 전혀 건드리지 않는다(이 컴포넌트는 읽기 전용 클라이언트 렌더링).
 */

const GROUP_ORDER: readonly string[] = ["12", "14", "39"];

function toStopsByGroup(places: PlaceWithDetails[]): Stop[][] {
  const groups = new Map<string, PlaceWithDetails[]>();
  for (const place of places) {
    if (!place.coordinateReliable || place.lat === null || place.lng === null) continue;
    const key = place.externalContentTypeId ?? "기타";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(place);
  }

  const orderedKeys = [...GROUP_ORDER, ...[...groups.keys()].filter((k) => !GROUP_ORDER.includes(k))];

  const stopsByGroup: Stop[][] = [];
  orderedKeys.forEach((key, groupIndex) => {
    const group = groups.get(key);
    if (!group || group.length === 0) return;
    stopsByGroup.push(
      group.map((place, i) => ({
        day: groupIndex + 1,
        indexInDay: i + 1,
        title: place.name,
        location: { lat: Number(place.lat), lng: Number(place.lng) },
      }))
    );
  });
  return stopsByGroup;
}

export function PlacesMap({ places }: { places: PlaceWithDetails[] }) {
  const stopsByGroup = toStopsByGroup(places);
  const reliableCount = stopsByGroup.reduce((sum, g) => sum + g.length, 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (stopsByGroup.length === 0 || !containerRef.current) {
      setStatus("error");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // TourAPI 데이터는 현재 전부 국내(서울/제주시/서귀포시)이므로 항상 "국내" 고정 —
        // resolveMapProvider()는 무수정 재사용, region 판단 기준 자체를 건드리지 않는다.
        const provider = resolveMapProvider("국내");
        await provider.load();
        if (cancelled || !containerRef.current) return;

        mapInstanceRef.current = provider.render(containerRef.current, stopsByGroup);
        setStatus("ready");
      } catch (error) {
        console.error("지도 로딩 실패:", error);
        if (!cancelled) setStatus("error");
      }
    })();

    const resizeObserver = new ResizeObserver(() => mapInstanceRef.current?.relayout());
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      cancelled = true;
      mapInstanceRef.current = null;
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  if (stopsByGroup.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        지도에 표시할 신뢰 가능한 좌표가 없어요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">신뢰 가능한 좌표 {reliableCount}곳을 표시합니다.</p>
      <div className="relative">
        <div ref={containerRef} className="h-[320px] w-full overflow-hidden rounded-lg border sm:h-[420px]" />
        {status === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">
            지도를 불러오는 중...
          </div>
        )}
        {status === "error" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">
            지도를 불러오지 못했어요.
          </div>
        )}
      </div>
    </div>
  );
}
