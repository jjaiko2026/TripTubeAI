"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoLocation, Itinerary } from "@/lib/types";

interface Stop {
  day: number;
  indexInDay: number;
  title: string;
  time: string;
  location: GeoLocation;
}

const DAY_COLORS = [
  "#0d9488", // teal
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#e11d48", // rose
  "#8b5cf6", // violet
  "#0891b2", // cyan
  "#65a30d", // lime
  "#db2777", // pink
];

function colorForDay(day: number): string {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderNaverMap(container: HTMLDivElement, stopsByDay: Stop[][]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const naver = (window as any).naver;
  const bounds = new naver.maps.LatLngBounds();
  const first = stopsByDay[0][0];
  const map = new naver.maps.Map(container, {
    center: new naver.maps.LatLng(first.location.lat, first.location.lng),
    zoom: 13,
  });

  stopsByDay.forEach((stops) => {
    const color = colorForDay(stops[0].day);
    const path = stops.map((s) => new naver.maps.LatLng(s.location.lat, s.location.lng));
    path.forEach((p: unknown) => bounds.extend(p));

    stops.forEach((stop, i) => {
      new naver.maps.Marker({
        position: path[i],
        map,
        title: stop.title,
        icon:
          i === 0
            ? { content: dayStartIconHtml(stop.day, color), anchor: new naver.maps.Point(24, 12) }
            : { content: numberedIconHtml(stop.indexInDay, color), anchor: new naver.maps.Point(13, 13) },
      });
    });

    if (path.length > 1) {
      new naver.maps.Polyline({ map, path, strokeColor: color, strokeWeight: 3, strokeOpacity: 0.85 });
    }
  });

  map.fitBounds(bounds);

  return {
    relayout() {
      naver.maps.Event.trigger(map, "resize");
      map.fitBounds(bounds);
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderGoogleMap(container: HTMLDivElement, stopsByDay: Stop[][]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google = (window as any).google;
  const bounds = new google.maps.LatLngBounds();
  const first = stopsByDay[0][0];
  const map = new google.maps.Map(container, { center: first.location, zoom: 13 });

  stopsByDay.forEach((stops) => {
    const color = colorForDay(stops[0].day);
    stops.forEach((s) => bounds.extend(s.location));

    stops.forEach((stop, i) => {
      if (i === 0) {
        new google.maps.Marker({
          position: stop.location,
          map,
          title: stop.title,
          icon: {
            url: pillIconDataUrl(stop.day, color),
            scaledSize: new google.maps.Size(48, 24),
            anchor: new google.maps.Point(24, 12),
          },
          label: { text: `${stop.day}일차`, color: "#fff", fontSize: "11px", fontWeight: "700" },
        });
      } else {
        new google.maps.Marker({
          position: stop.location,
          map,
          title: stop.title,
          icon: {
            url: circleIconDataUrl(color),
            scaledSize: new google.maps.Size(26, 26),
            anchor: new google.maps.Point(13, 13),
          },
          label: { text: String(stop.indexInDay), color: "#fff", fontSize: "12px", fontWeight: "600" },
        });
      }
    });

    if (stops.length > 1) {
      new google.maps.Polyline({
        map,
        path: stops.map((s) => s.location),
        strokeColor: color,
        strokeWeight: 3,
        strokeOpacity: 0.85,
      });
    }
  });

  map.fitBounds(bounds);

  return {
    relayout() {
      google.maps.event.trigger(map, "resize");
      map.fitBounds(bounds);
    },
  };
}

export function ItineraryMap({ itinerary }: { itinerary: Itinerary }) {
  const stopsByDay = collectStopsByDay(itinerary);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (stopsByDay.length === 0 || !containerRef.current) {
      setStatus("error");
      return;
    }

    let cancelled = false;
    let instance: { relayout: () => void } | null = null;

    (async () => {
      try {
        if (itinerary.region === "국내") {
          await loadNaverMaps();
        } else {
          await loadGoogleMaps();
        }
        if (cancelled || !containerRef.current) return;

        instance =
          itinerary.region === "국내"
            ? renderNaverMap(containerRef.current, stopsByDay)
            : renderGoogleMap(containerRef.current, stopsByDay);
        setStatus("ready");
      } catch (error) {
        console.error("지도 로딩 실패:", error);
        if (!cancelled) setStatus("error");
      }
    })();

    const resizeObserver = new ResizeObserver(() => instance?.relayout());
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary.region]);

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
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {stopsByDay.map((stops) => (
            <span key={stops[0].day} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colorForDay(stops[0].day) }}
              />
              {stops[0].day}일차
            </span>
          ))}
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
      </div>
    </div>
  );
}
