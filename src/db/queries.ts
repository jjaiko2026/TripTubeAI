import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { itineraries, placeTourismDetails, places, regions, reviews } from "@/db/schema";
import type { Itinerary, ItineraryDay, ItineraryItem, Review, TripTips } from "@/lib/types";
import { normalizeTripPurposes, PURPOSE_LABELS, type PurposeId } from "@/lib/purposes";
import { getHomepageDisplayStatus, isCoordinateReliable, type HomepageDisplay } from "@/lib/tour-api/quality";

const EMPTY_TRIP_TIPS: TripTips = { climate: "", packingList: [], recentIssues: [] };

export async function saveItinerary(itinerary: Itinerary, userId: string | null) {
  const db = getDb();
  const [row] = await db
    .insert(itineraries)
    .values({
      userId,
      destination: itinerary.request.destination,
      destinationName: itinerary.destinationName,
      region: itinerary.region,
      memberType: itinerary.request.memberType,
      memberCount: itinerary.request.memberCount,
      nights: itinerary.request.nights,
      month: itinerary.request.month,
      purposes: itinerary.request.purposes,
      notes: itinerary.request.notes || null,
      days: itinerary.days,
      estimatedTotalCost: itinerary.estimatedTotalCost,
      currency: itinerary.currency,
      tripTips: itinerary.tripTips,
    })
    .returning({ id: itineraries.id });
  return row.id;
}

export interface ItinerarySummary {
  id: string;
  destinationName: string;
  region: Itinerary["region"];
  memberType: string;
  memberCount: number;
  nights: number;
  month: number;
  createdAt: string;
}

/** 로그인한 사용자가 최근에 만든 일정을 다시 찾아갈 수 있게 요약 정보만 가져옵니다. */
export async function getRecentItinerariesForUser(userId: string, limit = 3): Promise<ItinerarySummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: itineraries.id,
      destinationName: itineraries.destinationName,
      region: itineraries.region,
      memberType: itineraries.memberType,
      memberCount: itineraries.memberCount,
      nights: itineraries.nights,
      month: itineraries.month,
      createdAt: itineraries.createdAt,
    })
    .from(itineraries)
    .where(eq(itineraries.userId, userId))
    .orderBy(desc(itineraries.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    region: row.region as Itinerary["region"],
    createdAt: row.createdAt.toISOString(),
  }));
}

/** 본인이 만든 일정만 지울 수 있도록 userId까지 조건에 포함합니다. */
export async function deleteItinerary(id: string, userId: string): Promise<void> {
  const db = getDb();
  await db.delete(itineraries).where(and(eq(itineraries.id, id), eq(itineraries.userId, userId)));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * userId를 넘기면 본인 소유 일정일 때만 반환합니다("조건 다시 입력" 프리필처럼 다른 사람의
 * 요청 내용을 노출하면 안 되는 조회에 사용). 결과 페이지 등 소유자 무관 조회는 생략합니다.
 */
export async function getItinerary(id: string, userId?: string): Promise<Itinerary | null> {
  if (!UUID_RE.test(id)) return null;

  const db = getDb();
  const condition = userId ? and(eq(itineraries.id, id), eq(itineraries.userId, userId)) : eq(itineraries.id, id);
  const [row] = await db.select().from(itineraries).where(condition).limit(1);
  if (!row) return null;

  return {
    request: {
      destination: row.destination,
      region: row.region as Itinerary["region"],
      memberType: row.memberType as Itinerary["request"]["memberType"],
      memberCount: row.memberCount,
      nights: row.nights,
      month: row.month,
      purposes: normalizeTripPurposes(row.purposes),
      // 이 컬럼이 생기기 전에 저장된 일정은 null이라 빈 값으로 대체합니다.
      notes: row.notes ?? "",
    },
    destinationName: row.destinationName,
    region: row.region as Itinerary["region"],
    days: row.days as ItineraryDay[],
    estimatedTotalCost: row.estimatedTotalCost,
    currency: row.currency as Itinerary["currency"],
    generatedAt: row.createdAt.toISOString(),
    // 이 컬럼이 생기기 전에 저장된 일정은 null이라 빈 값으로 대체합니다.
    tripTips: (row.tripTips as TripTips | null) ?? EMPTY_TRIP_TIPS,
  };
}

export async function getReviews(): Promise<Review[]> {
  const db = getDb();
  const rows = await db.select().from(reviews).orderBy(desc(reviews.createdAt));
  return rows.map((row) => ({
    id: row.id,
    author: row.author,
    destination: row.destination,
    rating: row.rating,
    title: row.title,
    content: row.content,
    tripMonth: row.tripMonth,
    nights: row.nights,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createReview(review: {
  userId: string | null;
  author: string;
  destination: string;
  rating: number;
  title: string;
  content: string;
  tripMonth: number;
  nights: number;
}) {
  const db = getDb();
  await db.insert(reviews).values(review);
}

export interface DashboardData {
  totalItineraries: number;
  dailyGenerated: { date: string; count: number }[];
  topDestinations: { destination: string; count: number }[];
  purposeDistribution: { name: string; value: number }[];
}

/** 대시보드용 실제 집계. 표본이 아직 작은 초기 단계라 DB에서 집계 없이 통째로 읽어 JS에서 계산합니다. */
export async function getDashboardData(days = 30): Promise<DashboardData> {
  const db = getDb();
  const rows = await db
    .select({
      destinationName: itineraries.destinationName,
      purposes: itineraries.purposes,
      createdAt: itineraries.createdAt,
    })
    .from(itineraries);

  // row.createdAt.toISOString()의 날짜(UTC 기준)와 맞춰야 하므로, 버킷 날짜도
  // 서버 로컬 타임존이 아닌 UTC 자정 기준으로 계산합니다.
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUTC - i * 86_400_000);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }

  const destinationCounts = new Map<string, number>();
  const purposeCounts = new Map<PurposeId, number>();

  for (const row of rows) {
    const dayKey = row.createdAt.toISOString().slice(0, 10);
    if (byDay.has(dayKey)) byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);

    destinationCounts.set(row.destinationName, (destinationCounts.get(row.destinationName) ?? 0) + 1);

    for (const purpose of normalizeTripPurposes(row.purposes)) {
      purposeCounts.set(purpose.id, (purposeCounts.get(purpose.id) ?? 0) + 1);
    }
  }

  return {
    totalItineraries: rows.length,
    dailyGenerated: Array.from(byDay.entries()).map(([date, count]) => ({ date, count })),
    topDestinations: Array.from(destinationCounts.entries())
      .map(([destination, count]) => ({ destination, count }))
      .sort((a, b) => b.count - a.count),
    purposeDistribution: Array.from(purposeCounts.entries())
      .map(([id, value]) => ({ name: PURPOSE_LABELS[id], value }))
      .sort((a, b) => b.value - a.value),
  };
}

export interface PlaceWithDetails {
  id: string;
  name: string;
  category: string;
  address: string | null;
  lat: string | null;
  lng: string | null;
  /** quality.ts isCoordinateReliable() 판정 결과 — false면 지도/좌표 의존 UI에서 제외
   *  대상(docs/PHASE3K_QUALITY_POLICY.md §5.3). lat/lng 원본값은 그대로 함께 반환한다. */
  coordinateReliable: boolean;
  /** quality.ts getHomepageDisplayStatus() 판정 결과 — CLICKABLE이 아니면 url은 항상 null,
   *  원본 HTML을 이 함수 밖으로 내보내지 않는다(§6.4/§7). */
  homepage: HomepageDisplay;
  tel: string | null;
  overview: string | null;
  externalContentTypeId: string | null;
  /** TourAPI 대/중분류(cat1/cat2 원본, 예: "A02"/"A0206"). PHASE A-BRIDGE STEP 1에서 실측
   *  확인한 실제 코드 체계 — src/lib/itinerary.ts의 TOUR_API_CATEGORY_LABELS가 사람이 읽는
   *  라벨로 변환한다. 소분류(cat3)는 표본에서 의미 있는 활용처를 못 찾아 가져오지 않는다. */
  categoryCode1: string | null;
  categoryCode2: string | null;
  /** place_tourism_details.detail_data 원본(유형별 필드가 달라 공통 스키마로 만들지 않음,
   *  PHASE3H §11.1). 해당 place의 상세정보가 없으면 null. */
  detailData: unknown | null;
}

/**
 * TourAPI 출처(place.externalSource='tour_api') place를 region.code 기준으로 조회한다
 * (PHASE 3-L-1). places + place_tourism_details를 조인하고, quality.ts의 조회 시점 판정
 * 함수(getHomepageDisplayStatus/isCoordinateReliable)를 매핑 단계에서 한 번만 적용해
 * 반환한다 — 원본 lat/lng/homepage 컬럼은 그대로 함께 내려주고 원본을 변형하지 않는다.
 * DB는 READ-ONLY로만 접근한다(SELECT뿐, INSERT/UPDATE/DELETE 없음).
 */
export async function getPlacesByRegion(regionCode: string): Promise<PlaceWithDetails[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      category: places.category,
      address: places.address,
      lat: places.lat,
      lng: places.lng,
      homepage: places.homepage,
      tel: places.tel,
      overview: places.overview,
      externalContentTypeId: places.externalContentTypeId,
      categoryCode1: places.categoryCode1,
      categoryCode2: places.categoryCode2,
      detailData: placeTourismDetails.detailData,
    })
    .from(places)
    .innerJoin(regions, eq(places.regionId, regions.id))
    .leftJoin(
      placeTourismDetails,
      and(eq(placeTourismDetails.placeId, places.id), eq(placeTourismDetails.contentTypeId, places.externalContentTypeId))
    )
    .where(and(eq(regions.code, regionCode), eq(places.externalSource, "tour_api")));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    coordinateReliable: isCoordinateReliable(row.lat, row.lng),
    homepage: getHomepageDisplayStatus(row.homepage),
    tel: row.tel,
    overview: row.overview,
    externalContentTypeId: row.externalContentTypeId,
    categoryCode1: row.categoryCode1,
    categoryCode2: row.categoryCode2,
    detailData: row.detailData ?? null,
  }));
}

const PLACE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * TourAPI 출처 place 1건을 id(uuid)로 조회한다(PHASE 3-L-2, /places/[id] 상세 페이지용).
 * getPlacesByRegion()과 동일한 조인/매핑 로직을 쓰지만, getPlacesByRegion() 자체는
 * 수정하지 않고 별도 함수로 둔다 — 반환 1건이라 필터 조건만 다를 뿐 로직은 그대로다.
 * 잘못된 형식의 id는 DB에 보내지 않고 즉시 null을 반환한다(getItinerary()의 UUID_RE
 * 검사와 동일 패턴).
 */
export async function getPlaceById(id: string): Promise<PlaceWithDetails | null> {
  if (!PLACE_ID_RE.test(id)) return null;

  const db = getDb();
  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      category: places.category,
      address: places.address,
      lat: places.lat,
      lng: places.lng,
      homepage: places.homepage,
      tel: places.tel,
      overview: places.overview,
      externalContentTypeId: places.externalContentTypeId,
      categoryCode1: places.categoryCode1,
      categoryCode2: places.categoryCode2,
      detailData: placeTourismDetails.detailData,
    })
    .from(places)
    .leftJoin(
      placeTourismDetails,
      and(eq(placeTourismDetails.placeId, places.id), eq(placeTourismDetails.contentTypeId, places.externalContentTypeId))
    )
    .where(and(eq(places.id, id), eq(places.externalSource, "tour_api")))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    coordinateReliable: isCoordinateReliable(row.lat, row.lng),
    homepage: getHomepageDisplayStatus(row.homepage),
    tel: row.tel,
    overview: row.overview,
    externalContentTypeId: row.externalContentTypeId,
    categoryCode1: row.categoryCode1,
    categoryCode2: row.categoryCode2,
    detailData: row.detailData ?? null,
  };
}

/**
 * TourAPI place 1건을 사용자 소유 일정의 1일차에 추가한다(TOUR PLACE → ITINERARY v1).
 * 좌표는 isCoordinateReliable() 판정을 그대로 신뢰한다 — 재검증하지 않고 place 객체에
 * 이미 계산된 값(getPlaceById()/getPlacesByRegion() 반환값)을 사용, 신뢰 불가 좌표는
 * location을 null로 남겨 지도에 잘못된 마커가 찍히지 않게 한다. TourAPI 원본 데이터를
 * 일정 쪽에 중복 저장하지 않고 place.id만 참조로 남긴다(placeId, src/lib/types.ts).
 * deleteItinerary()와 동일하게 (id, userId) 둘 다 일치해야만 수정한다 — 소유자 확인.
 */
export async function addPlaceToItinerary(
  itineraryId: string,
  userId: string,
  place: PlaceWithDetails,
  day: number,
  /** AI ITINERARY GENERATION v1 — AI가 이 장소를 이 날짜/순서에 넣은 이유를 item.description에
   *  싣고 싶을 때만 넘긴다. 생략하면 기존과 동일하게 place.overview를 그대로 쓴다(하위 호환,
   *  기존 호출부 전부 무수정으로 계속 동작). */
  overrides?: { time?: string; description?: string }
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ days: itineraries.days })
    .from(itineraries)
    .where(and(eq(itineraries.id, itineraryId), eq(itineraries.userId, userId)))
    .limit(1);
  if (!row) return false;

  const days = (row.days as ItineraryDay[] | null) ?? [];

  const newItem: ItineraryItem = {
    time: overrides?.time ?? "",
    title: place.name,
    description: overrides?.description ?? place.overview ?? "",
    tags: [],
    sources: [],
    location:
      place.coordinateReliable && place.lat !== null && place.lng !== null
        ? { lat: Number(place.lat), lng: Number(place.lng) }
        : null,
    placeId: place.id,
  };

  const hasTargetDay = days.some((d) => d.day === day);
  const nextDays: ItineraryDay[] = hasTargetDay
    ? days.map((d) => (d.day === day ? { ...d, items: [...d.items, newItem] } : d))
    : [...days, { day, label: `${day}일차`, items: [newItem] }].sort((a, b) => a.day - b.day);

  await db.update(itineraries).set({ days: nextDays }).where(eq(itineraries.id, itineraryId));
  return true;
}

/**
 * addPlaceToItinerary()로 추가된 TourAPI 장소 항목을 일정에서 제거한다
 * (ITINERARY PLACE MANAGEMENT v1). placeId 기준으로 식별한다 — 일반 인덱스가 아니라
 * placeId로 지운다. 같은 날에 같은 place가 중복 추가된 경우 전부 제거된다(v1 범위 밖,
 * 중복 방지 자체는 이번에 다루지 않음). addPlaceToItinerary()와 동일하게 (id, userId)
 * 소유자 확인을 거친다.
 */
export async function removePlaceFromItinerary(
  itineraryId: string,
  userId: string,
  day: number,
  placeId: string
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ days: itineraries.days })
    .from(itineraries)
    .where(and(eq(itineraries.id, itineraryId), eq(itineraries.userId, userId)))
    .limit(1);
  if (!row) return false;

  const days = (row.days as ItineraryDay[] | null) ?? [];
  const nextDays = days.map((d) =>
    d.day === day ? { ...d, items: d.items.filter((item) => item.placeId !== placeId) } : d
  );

  await db.update(itineraries).set({ days: nextDays }).where(eq(itineraries.id, itineraryId));
  return true;
}
