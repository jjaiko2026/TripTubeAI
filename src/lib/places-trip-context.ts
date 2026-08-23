import { getItinerary } from "@/db/queries";
import type { PurposeId } from "@/lib/purposes";

/**
 * PHASE 2 STEP 4 — itinerary.ts의 resolveTourApiRegions()와 정반대 방향(destinationName →
 * /places가 지원하는 regionCode). 그 함수가 인식하는 키와 동일하게 "서울"/"제주도"/"서귀포"만
 * 다룬다("제주시"/"서귀포시" 아님, PHASE 2 STEP 1/2에서 확인한 문자열 불일치 함정과 동일한
 * 이유). 3개뿐이라 itinerary.ts/actions.ts와 같은 관례로 공유 모듈로 더 쪼개지 않는다.
 * 매핑에 없는 destinationName은 null — 호출부는 이걸 "이 여행은 TourAPI 데이터가 없음"으로
 * 명확히 구분해야 하고, 서울 등 임의 지역으로 조용히 대체하면 안 된다.
 */
const DESTINATION_TO_DEFAULT_REGION_CODE: Record<string, string> = {
  서울: "KR-SEOUL-CITY",
  제주도: "KR-JEJU-JEJUSI",
  서귀포: "KR-JEJU-SEOGWIPO",
  // PHASE 2 STEP 2 이전에 저장된 구형 Pipeline B legacy itinerary는 destinationName이
  // "제주시"/"서귀포시"(당시 REGION_LABELS를 그대로 destination에 썼던 값)다. 실제 프로덕션
  // 데이터와의 하위 호환을 위해 정확히 아는 두 값만 추가한다(추측 매핑 아님).
  제주시: "KR-JEJU-JEJUSI",
  서귀포시: "KR-JEJU-SEOGWIPO",
};

export interface PlacesTripContext {
  itineraryId: string;
  destinationName: string;
  nights: number;
  purposes: PurposeId[];
  notes: string;
  /** 이 itinerary의 days에 이미 들어있는 TourAPI 장소 id(§ItineraryItem.placeId). */
  existingPlaceIds: Set<string>;
  /** 현재 로그인 사용자가 이 itinerary의 소유자인지(§/plan/result/[id]의 canManage와 동일
   *  패턴). /plan/result/[id]가 의도적으로 공개 공유 링크이듯, 이 값이 false/비로그인이어도
   *  destination/existingPlaceIds 등 읽기 정보는 그대로 쓸 수 있다 — 다만 "일정에 추가"의
   *  기본 선택값으로 이 itinerary를 미리 골라주는 것은 소유자에게만 의미가 있으므로 그 용도로는
   *  반드시 이 값을 확인해야 한다. */
  canManage: boolean;
  /** null이면 이 여행지는 TourAPI 3개 지역 중 어디에도 해당하지 않는다. */
  defaultRegionCode: string | null;
}

export async function getPlacesTripContext(
  itineraryId: string,
  userId: string | null
): Promise<PlacesTripContext | null> {
  const [itinerary, ownedItinerary] = await Promise.all([
    getItinerary(itineraryId),
    userId ? getItinerary(itineraryId, userId) : Promise.resolve(null),
  ]);
  if (!itinerary) return null;

  const existingPlaceIds = new Set(
    itinerary.days
      .flatMap((day) => day.items)
      .map((item) => item.placeId)
      .filter((id): id is string => Boolean(id))
  );

  return {
    itineraryId,
    destinationName: itinerary.destinationName,
    nights: itinerary.request.nights,
    purposes: itinerary.request.purposes.map((p) => p.id),
    notes: itinerary.request.notes,
    existingPlaceIds,
    canManage: ownedItinerary !== null,
    defaultRegionCode: DESTINATION_TO_DEFAULT_REGION_CODE[itinerary.destinationName] ?? null,
  };
}

/** /places, /places/recommend, /places/plan 사이를 이동할 때 region/itineraryId/day 중
 *  있는 값만 쿼리스트링으로 만든다 — 현재 여행 context를 일관되게 이어 붙이기 위한 헬퍼. */
export function buildPlacesQuery(params: { region?: string; itineraryId?: string; day?: string }): string {
  const search = new URLSearchParams();
  if (params.region) search.set("region", params.region);
  if (params.itineraryId) search.set("itineraryId", params.itineraryId);
  if (params.day) search.set("day", params.day);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * /places/[id]로 이동하는 링크 전용. 그 페이지는 기존부터 itineraryId를 fromItinerary라는
 * 이름으로 받는다 — /plan/result/[id]의 itinerary-item-card.tsx가 이미 이 이름으로 링크를
 * 만들고 있어(이번 작업 범위 밖, 무수정), 이름을 통일하지 않고 여기서만 변환한다.
 */
export function buildPlaceDetailQuery(params: { itineraryId?: string; day?: string }): string {
  const search = new URLSearchParams();
  if (params.itineraryId) search.set("fromItinerary", params.itineraryId);
  if (params.day) search.set("day", params.day);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
