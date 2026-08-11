"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoLocation, Itinerary } from "@/lib/types";
import { colorForDay } from "@/lib/day-colors";

interface Stop {
  day: number;
  indexInDay: number;
  title: string;
  time: string;
  location: GeoLocation;
}

function collectStopsByDay(itinerary: Itinerary): Stop[][] {
  const byDay: Stop[][] = [];
  for (const day of itinerary.days) {
    const stops: Stop[] = [];
    for (const item of day.items) {
      if (item.location) {
        stops.push({ day: day.day, indexInDay: stops.length + 1, title: item.title, time: item.time, location: item.location });
      }
    }
    if (stops.length > 0) byDay.push(stops);
  }
  return byDay;
}

let naverMapsPromise: Promise<void> | null = null;
function loadNaverMaps(): Promise<void> {
  const w = window as unknown as { naver?: { maps?: unknown } };
  if (w.naver?.maps) return Promise.resolve();
  if (naverMapsPromise) return naverMapsPromise;

  naverMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("네이버 지도 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return naverMapsPromise;
}

let googleMapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  const w = window as unknown as { google?: { maps?: unknown } };
  if (w.google?.maps) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_CLIENT_KEY}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("구글 지도 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

function numberedIconHtml(index: number, color: string) {
  return `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${color};color:#fff;font:600 12px sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4);">${index}</div>`;
}

function dayStartIconHtml(day: number, color: string) {
  return `<div style="display:flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:9999px;background:${color};color:#fff;font:700 12px sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4);">${day}일차</div>`;
}

function circleIconDataUrl(color: string, size = 26) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1.5}" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function pillIconDataUrl(day: number, color: string, width = 48, height = 24) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${height / 2}" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

interface MapInstance {
  relayout(): void;
  /** 활성화된 일차의 마커/동선만 지도에 남기고, 화면도 그 일차들에 맞춰 다시 맞춥니다. */
  setActiveDays(days: Set<number>): void;
}

function renderNaverMap(container: HTMLDivElement, stopsByDay: Stop[][]): MapInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const naver = (window as any).naver;
  const fullBounds = new naver.maps.LatLngBounds();
  const first = stopsByDay[0][0];
  const map = new naver.maps.Map(container, {
    center: new naver.maps.LatLng(first.location.lat, first.location.lng),
    zoom: 13,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerByDay = new Map<number, { path: any[]; markers: any[]; polyline: any | null }>();

  stopsByDay.forEach((stops) => {
    const color = colorForDay(stops[0].day);
    const path = stops.map((s) => new naver.maps.LatLng(s.location.lat, s.location.lng));
    path.forEach((p: unknown) => fullBounds.extend(p));

    const markers = stops.map((stop, i) =>
      new naver.maps.Marker({
        position: path[i],
        map,
        title: stop.title,
        icon:
          i === 0
            ? { content: dayStartIconHtml(stop.day, color), anchor: new naver.maps.Point(24, 12) }
            : { content: numberedIconHtml(stop.indexInDay, color), anchor: new naver.maps.Point(13, 13) },
      })
    );

    const polyline =
      path.length > 1
        ? new naver.maps.Polyline({ map, path, strokeColor: color, strokeWeight: 3, strokeOpacity: 0.85 })
        : null;

    layerByDay.set(stops[0].day, { path, markers, polyline });
  });

  map.fitBounds(fullBounds);

  return {
    relayout() {
      naver.maps.Event.trigger(map, "resize");
      map.fitBounds(fullBounds);
    },
    setActiveDays(days) {
      const visibleBounds = new naver.maps.LatLngBounds();
      layerByDay.forEach((layer, day) => {
        const visible = days.has(day);
        layer.markers.forEach((m) => m.setMap(visible ? map : null));
        layer.polyline?.setMap(visible ? map : null);
        if (visible) layer.path.forEach((p) => visibleBounds.extend(p));
      });
      if (!visibleBounds.isEmpty()) map.fitBounds(visibleBounds);
    },
  };
}

function renderGoogleMap(container: HTMLDivElement, stopsByDay: Stop[][]): MapInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google = (window as any).google;
  const fullBounds = new google.maps.LatLngBounds();
  const first = stopsByDay[0][0];
  const map = new google.maps.Map(container, { center: first.location, zoom: 13 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerByDay = new Map<number, { points: any[]; markers: any[]; polyline: any | null }>();

  stopsByDay.forEach((stops) => {
    const color = colorForDay(stops[0].day);
    stops.forEach((s) => fullBounds.extend(s.location));

    const markers = stops.map((stop, i) =>
      i === 0
        ? new google.maps.Marker({
            position: stop.location,
            map,
            title: stop.title,
            icon: {
              url: pillIconDataUrl(stop.day, color),
              scaledSize: new google.maps.Size(48, 24),
              anchor: new google.maps.Point(24, 12),
            },
            label: { text: `${stop.day}일차`, color: "#fff", fontSize: "11px", fontWeight: "700" },
          })
        : new google.maps.Marker({
            position: stop.location,
            map,
            title: stop.title,
            icon: {
              url: circleIconDataUrl(color),
              scaledSize: new google.maps.Size(26, 26),
              anchor: new google.maps.Point(13, 13),
            },
            label: { text: String(stop.indexInDay), color: "#fff", fontSize: "12px", fontWeight: "600" },
          })
    );

    const polyline =
      stops.length > 1
        ? new google.maps.Polyline({
            map,
            path: stops.map((s) => s.location),
            strokeColor: color,
            strokeWeight: 3,
            strokeOpacity: 0.85,
          })
        : null;

    layerByDay.set(stops[0].day, { points: stops.map((s) => s.location), markers, polyline });
  });

  map.fitBounds(fullBounds);

  return {
    relayout() {
      google.maps.event.trigger(map, "resize");
      map.fitBounds(fullBounds);
    },
    setActiveDays(days) {
      const visibleBounds = new google.maps.LatLngBounds();
      layerByDay.forEach((layer, day) => {
        const visible = days.has(day);
        layer.markers.forEach((m) => m.setMap(visible ? map : null));
        layer.polyline?.setMap(visible ? map : null);
        if (visible) layer.points.forEach((p) => visibleBounds.extend(p));
      });
      if (!visibleBounds.isEmpty()) map.fitBounds(visibleBounds);
    },
  };
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
        if (itinerary.region === "국내") {
          await loadNaverMaps();
        } else {
          await loadGoogleMaps();
        }
        if (cancelled || !containerRef.current) return;

        mapInstanceRef.current =
          itinerary.region === "국내"
            ? renderNaverMap(containerRef.current, stopsByDay)
            : renderGoogleMap(containerRef.current, stopsByDay);
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
