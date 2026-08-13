import type { MapInstance, MapProvider, Stop } from "@/components/itinerary/map-providers/types";
import { colorForDay } from "@/lib/day-colors";

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

function circleIconDataUrl(color: string, size = 26) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1.5}" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function pillIconDataUrl(day: number, color: string, width = 48, height = 24) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${height / 2}" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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

export const googleMapProvider: MapProvider = {
  id: "google",
  load: loadGoogleMaps,
  render: renderGoogleMap,
};
