"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoLocation, Itinerary } from "@/lib/types";

interface Stop {
  order: number;
  title: string;
  time: string;
  location: GeoLocation;
}

function collectStops(itinerary: Itinerary): Stop[] {
  const stops: Stop[] = [];
  for (const day of itinerary.days) {
    for (const item of day.items) {
      if (item.location) {
        stops.push({ order: stops.length + 1, title: item.title, time: item.time, location: item.location });
      }
    }
  }
  return stops;
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

const ROUTE_COLOR = "#0d9488";

function numberedIconHtml(order: number) {
  return `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${ROUTE_COLOR};color:#fff;font:600 12px sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4);">${order}</div>`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderNaverMap(container: HTMLDivElement, stops: Stop[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const naver = (window as any).naver;
  const bounds = new naver.maps.LatLngBounds();
  const path = stops.map((s) => new naver.maps.LatLng(s.location.lat, s.location.lng));
  path.forEach((p: unknown) => bounds.extend(p));

  const map = new naver.maps.Map(container, { center: path[0], zoom: 13 });

  stops.forEach((stop, i) => {
    new naver.maps.Marker({
      position: path[i],
      map,
      title: stop.title,
      icon: { content: numberedIconHtml(stop.order), anchor: new naver.maps.Point(13, 13) },
    });
  });

  new naver.maps.Polyline({ map, path, strokeColor: ROUTE_COLOR, strokeWeight: 3, strokeOpacity: 0.85 });
  map.fitBounds(bounds);

  return {
    relayout() {
      naver.maps.Event.trigger(map, "resize");
      map.fitBounds(bounds);
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderGoogleMap(container: HTMLDivElement, stops: Stop[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google = (window as any).google;
  const bounds = new google.maps.LatLngBounds();
  stops.forEach((s) => bounds.extend(s.location));

  const map = new google.maps.Map(container, { center: stops[0].location, zoom: 13 });

  stops.forEach((stop) => {
    new google.maps.Marker({
      position: stop.location,
      map,
      title: stop.title,
      label: { text: String(stop.order), color: "#fff", fontSize: "12px", fontWeight: "600" },
    });
  });

  new google.maps.Polyline({
    map,
    path: stops.map((s) => s.location),
    strokeColor: ROUTE_COLOR,
    strokeWeight: 3,
    strokeOpacity: 0.85,
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
  const stops = collectStops(itinerary);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (stops.length === 0 || !containerRef.current) {
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
            ? renderNaverMap(containerRef.current, stops)
            : renderGoogleMap(containerRef.current, stops);
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

  if (stops.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        지도에 표시할 위치 정보를 찾지 못했어요.
      </div>
    );
  }

  return (
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
  );
}
