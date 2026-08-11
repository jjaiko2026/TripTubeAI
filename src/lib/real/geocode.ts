import type { GeoLocation } from "@/lib/types";

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const GOOGLE_GEOCODING_API_KEY = process.env.GOOGLE_GEOCODING_API_KEY;

interface NaverLocalItem {
  mapx?: string;
  mapy?: string;
}

async function geocodeNaverRaw(query: string): Promise<GeoLocation | null> {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "1");

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "X-NCP-APIGW-API-KEY-ID": NAVER_CLIENT_ID,
        "X-NCP-APIGW-API-KEY": NAVER_CLIENT_SECRET,
      },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { items?: NaverLocalItem[] };
    const item = json.items?.[0];
    if (!item?.mapx || !item?.mapy) return null;

    return { lat: Number(item.mapy) / 1e7, lng: Number(item.mapx) / 1e7 };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 국내 좌표: NAVER 지역 검색 API. mapx/mapy는 WGS84 경도/위도에 10^7을 곱한 정수값입니다.
 *
 * 지역 검색은 업체/장소명 매칭이라 "협재해수욕장 산책"처럼 활동을 나타내는 뒷말이
 * 붙으면 매칭이 실패합니다. 뒤에서부터 단어를 하나씩 줄여가며 핵심 장소명만 남을
 * 때까지 재시도합니다.
 */
export async function geocodeNaverPlace(destinationName: string, title: string): Promise<GeoLocation | null> {
  const words = title.split(/\s+/).filter(Boolean);

  for (let len = words.length; len >= 1; len--) {
    const query = `${destinationName} ${words.slice(0, len).join(" ")}`;
    const result = await geocodeNaverRaw(query);
    if (result) return result;
  }

  return null;
}

interface GoogleGeocodeResult {
  geometry?: { location?: { lat: number; lng: number } };
}

/** 해외 좌표: Google Geocoding API. */
export async function geocodeGoogle(query: string): Promise<GeoLocation | null> {
  if (!GOOGLE_GEOCODING_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", GOOGLE_GEOCODING_API_KEY);

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const json = (await res.json()) as { status: string; results?: GoogleGeocodeResult[] };
    if (json.status !== "OK") return null;

    const location = json.results?.[0]?.geometry?.location;
    if (!location) return null;

    return { lat: location.lat, lng: location.lng };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
