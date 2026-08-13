"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoLocation, Itinerary } from "@/lib/types";
import { colorForDay } from "@/lib/day-colors";
import { haversineMeters } from "@/lib/geo-order";
import type { MapInstance, Stop } from "@/components/itinerary/map-providers/types";
import { resolveMapProvider } from "@/components/itinerary/map-providers/resolver";

// 이 거리보다 가까운 같은 날 마커들은 화면상 겹쳐 보여 번호를 구분할 수 없다고 보고 벌려줍니다.
const OVERLAP_THRESHOLD_METERS = 60;
// 겹친 마커들을 실제 위치를 중심으로 이 반경의 작은 원 위에 펼쳐 배치합니다.
const SPREAD_RADIUS_METERS = 35;
const METERS_PER_LAT_DEGREE = 111_320;

function offsetLocation(center: GeoLocation, meters: number, angleRad: number): GeoLocation {
  const dLat = ((meters * Math.sin(angleRad)) / METERS_PER_LAT_DEGREE);
  const metersPerLngDegree = METERS_PER_LAT_DEGREE * Math.cos((center.lat * Math.PI) / 180);
  const dLng = metersPerLngDegree > 0 ? (meters * Math.cos(angleRad)) / metersPerLngDegree : 0;
  return { lat: center.lat + dLat, lng: center.lng + dLng };
}

/**
 * 같은 날 안에서 서로 아주 가까운(겹쳐 보이는) 좌표들을 찾아, 실제 위치를 중심으로 한
 * 작은 원 위에 방문 순서대로 펼쳐 배치합니다. 지도 표시 전용 보정이라 실제 저장된
 * item.location(동선 재정렬 등에 쓰이는 원본 좌표)은 건드리지 않습니다.
 */
function spreadOverlappingStops(stops: Stop[]): Stop[] {
  const groupOf = new Array<number>(stops.length).fill(-1);
  const groups: number[][] = [];

  for (let i = 0; i < stops.length; i++) {
    if (groupOf[i] !== -1) continue;
    const group = [i];
    groupOf[i] = groups.length;
    for (let j = i + 1; j < stops.length; j++) {
      if (groupOf[j] !== -1) continue;
      if (haversineMeters(stops[i].location, stops[j].location) < OVERLAP_THRESHOLD_METERS) {
        group.push(j);
        groupOf[j] = groups.length;
      }
    }
    groups.push(group);
  }

  const result = [...stops];
  for (const group of groups) {
    if (group.length < 2) continue;

    const centroid = {
      lat: group.reduce((sum, i) => sum + stops[i].location.lat, 0) / group.length,
      lng: group.reduce((sum, i) => sum + stops[i].location.lng, 0) / group.length,
    };

    group.forEach((stopIndex, k) => {
      const angle = (2 * Math.PI * k) / group.length;
      result[stopIndex] = { ...stops[stopIndex], location: offsetLocation(centroid, SPREAD_RADIUS_METERS, angle) };
    });
  }

  return result;
}

function collectStopsByDay(itinerary: Itinerary): Stop[][] {
  const byDay: Stop[][] = [];
  for (const day of itinerary.days) {
    const stops: Stop[] = [];
    for (const item of day.items) {
      if (item.location) {
        stops.push({ day: day.day, indexInDay: stops.length + 1, title: item.title, location: item.location });
      }
    }
    if (stops.length > 0) byDay.push(spreadOverlappingStops(stops));
  }
  return byDay;
}

export function ItineraryMap({ itinerary }: { itinerary: Itinerary }) {
  const stopsByDay = collectStopsByDay(itinerary);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeDays, setActiveDays] = useState<Set<number>>(
    () => new Set(stopsByDay.map((stops) => stops[0].day))
  );

  useEffect(() => {
    if (stopsByDay.length === 0 || !containerRef.current) {
      setStatus("error");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const provider = resolveMapProvider(itinerary.region);
        await provider.load();
        if (cancelled || !containerRef.current) return;

        mapInstanceRef.current = provider.render(containerRef.current, stopsByDay);
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
  }, [itinerary.region]);

  useEffect(() => {
    mapInstanceRef.current?.setActiveDays(activeDays);
  }, [activeDays]);

  function toggleDay(day: number) {
    setActiveDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  if (stopsByDay.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        지도에 표시할 위치 정보를 찾지 못했어요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {stopsByDay.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {stopsByDay.map((stops) => {
            const day = stops[0].day;
            const isActive = activeDays.has(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity hover:opacity-80"
                style={{ opacity: isActive ? 1 : 0.4 }}
                aria-pressed={isActive}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colorForDay(day) }}
                />
                <span className={isActive ? undefined : "line-through"}>{day}일차</span>
              </button>
            );
          })}
          {activeDays.size < stopsByDay.length && (
            <button
              type="button"
              onClick={() => setActiveDays(new Set(stopsByDay.map((stops) => stops[0].day)))}
              className="text-xs font-medium text-primary hover:underline"
            >
              전체 보기
            </button>
          )}
        </div>
      )}
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
        {status === "ready" && activeDays.size === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground">
            선택된 일차가 없어요. 일차를 눌러 다시 표시해 주세요.
          </div>
        )}
      </div>
    </div>
  );
}
