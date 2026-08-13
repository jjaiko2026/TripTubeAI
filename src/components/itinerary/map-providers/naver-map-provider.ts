import type { MapInstance, MapProvider, Stop } from "@/components/itinerary/map-providers/types";
import { colorForDay } from "@/lib/day-colors";

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

function numberedIconHtml(index: number, color: string) {
  return `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${color};color:#fff;font:600 12px sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4);">${index}</div>`;
}

function dayStartIconHtml(day: number, color: string) {
  return `<div style="display:flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:9999px;background:${color};color:#fff;font:700 12px sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4);">${day}일차</div>`;
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

export const naverMapProvider: MapProvider = {
  id: "naver",
  load: loadNaverMaps,
  render: renderNaverMap,
};
