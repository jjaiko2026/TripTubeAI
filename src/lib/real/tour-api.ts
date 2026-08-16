import { CONTENT_TYPE_TO_PURPOSES, TOUR_CONTENT_TYPE } from "@/lib/tour-category-map";
import { getCachedTourPlaces, saveCachedTourPlaces, type TourPlaceHint } from "@/db/tour-cache";
import { consumeTourApiQuota } from "@/db/rate-limit";

const TOUR_API_BASE_URL = process.env.TOUR_API_BASE_URL ?? "https://apis.data.go.kr/B551011/KorService2";
const TOUR_API_SERVICE_KEY = process.env.TOUR_API_SERVICE_KEY;

interface RawTourItem {
  title?: string;
  contenttypeid?: string;
}

async function callAreaBasedList(areaCode: string, contentTypeId: string): Promise<RawTourItem[]> {
  const params = new URLSearchParams({
    serviceKey: TOUR_API_SERVICE_KEY!,
    MobileOS: "ETC",
    MobileApp: "TripTubeAI",
    _type: "json",
    numOfRows: "15",
    arrange: "Q", // 조회순
    areaCode,
    contentTypeId,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${TOUR_API_BASE_URL}/areaBasedList2?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      response?: { body?: { items?: { item?: RawTourItem | RawTourItem[] } } };
    };
    const items = json.response?.body?.items?.item;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 국내 목적지의 실제 관광지/음식점 이름을 TourAPI에서 가져와, AI 일정 생성 프롬프트의
 * activityCatalog를 보강합니다. AI가 가상의 장소명을 지어내지 않고 검증된 실제 장소
 * 이름을 우선 참고하게 하는 것이 목적입니다(Rule: 검증 가능한 사실을 임의 생성하지 않음).
 * 키가 없거나 호출이 실패/쿼터 초과면 조용히 빈 배열을 반환해, 기존 activityCatalog만
 * 쓰는 이전 동작으로 자연스럽게 대체됩니다.
 */
export async function fetchTourApiPlaceHints(areaCode: string): Promise<TourPlaceHint[]> {
  if (!TOUR_API_SERVICE_KEY) return [];

  const cacheKey = `area::${areaCode}`;
  const cached = await getCachedTourPlaces(cacheKey).catch(() => null);
  if (cached) return cached;

  const withinBudget = await consumeTourApiQuota().catch((error) => {
    console.error("tour api rate limit check failed, allowing call:", error);
    return true;
  });
  if (!withinBudget) return [];

  const contentTypeIds = [TOUR_CONTENT_TYPE.touristSpot, TOUR_CONTENT_TYPE.restaurant, TOUR_CONTENT_TYPE.culturalFacility];
  const results = await Promise.all(contentTypeIds.map((contentTypeId) => callAreaBasedList(areaCode, contentTypeId)));

  const seen = new Set<string>();
  const hints: TourPlaceHint[] = [];
  results.forEach((items, index) => {
    const contentTypeId = contentTypeIds[index];
    const tags = CONTENT_TYPE_TO_PURPOSES[contentTypeId] ?? [];
    for (const item of items) {
      if (!item.title || seen.has(item.title)) continue;
      seen.add(item.title);
      hints.push({ title: item.title, tags });
    }
  });

  if (hints.length > 0) {
    await saveCachedTourPlaces(cacheKey, hints).catch((error) => console.error("tour place cache write failed:", error));
  }

  return hints;
}
