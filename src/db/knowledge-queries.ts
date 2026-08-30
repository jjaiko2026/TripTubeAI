import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { videoKnowledge, videos, regions, places } from "@/db/schema";
import type { KnowledgeTypeId, Confidence, KnowledgeContent } from "@/lib/knowledge/types";
import type { PlaceWithDetails } from "@/db/queries";
import { getHomepageDisplayStatus, isCoordinateReliable } from "@/lib/tour-api/quality";

export interface KnowledgeReviewProgress {
  total: number;
  confirmed: number;
  review: number;
  unverified: number;
}

/** video_knowledge.status 분포 — 대시보드에 검수 진행률을 보여주기 위한 집계다(PHASE 12 후속). */
export async function getKnowledgeReviewProgress(): Promise<KnowledgeReviewProgress> {
  const db = getDb();
  const rows = await db
    .select({ status: videoKnowledge.status, count: sql<number>`count(*)::int` })
    .from(videoKnowledge)
    .groupBy(videoKnowledge.status);

  const progress: KnowledgeReviewProgress = { total: 0, confirmed: 0, review: 0, unverified: 0 };
  for (const row of rows) {
    progress.total += row.count;
    if (row.status === "confirmed") progress.confirmed = row.count;
    else if (row.status === "review") progress.review = row.count;
    else if (row.status === "unverified") progress.unverified = row.count;
  }
  return progress;
}

// 프롬프트가 지나치게 커지지 않도록 하는 상한. content-sheet.ts의 MAX_EXPORT_QUERIES,
// itinerary.ts의 MAX_PLACE_SEARCH_QUERIES와 같은 취지의 안전 상한이다.
const MAX_REGIONAL_KNOWLEDGE_ITEMS = 10;

export interface RegionalKnowledgeItem {
  knowledgeType: KnowledgeTypeId;
  summary: string;
  confidence: Confidence;
  sourceReference: string;
}

/**
 * regionCode(regions.code)로 그 지역에 속한 영상들의 confirmed video_knowledge를 조회한다
 * (Phase 8-2 설계: region 기반 연결, placeId 불필요 — normalize-place 없이도 동작).
 * videoId 경로만 사용한다(sourceRefId/블로그 경로는 이번 범위 밖). placeId는 전혀 참조하지
 * 않는다. confirmed가 없으면(현재 운영 DB가 그렇다) 빈 배열을 반환해, 호출부가 Knowledge
 * 연결 이전과 완전히 동일하게 동작하도록 한다. DB 조회 자체가 실패하면 예외를 그대로
 * 던진다 — "데이터 없음"과 "조회 실패"를 같은 값(빈 배열)으로 뭉개지 않는다.
 */
export async function getConfirmedRegionalKnowledge(regionCode: string): Promise<RegionalKnowledgeItem[]> {
  const db = getDb();

  const rows = await db
    .select({
      knowledgeType: videoKnowledge.knowledgeType,
      content: videoKnowledge.content,
      confidence: videoKnowledge.confidence,
      sourceReference: videoKnowledge.sourceReference,
    })
    .from(videoKnowledge)
    .innerJoin(videos, eq(videoKnowledge.videoId, videos.videoId))
    .innerJoin(regions, eq(videos.regionId, regions.id))
    .where(
      and(
        eq(regions.code, regionCode),
        eq(videoKnowledge.status, "confirmed"),
        isNotNull(videoKnowledge.videoId)
      )
    )
    .orderBy(asc(videoKnowledge.createdAt))
    .limit(MAX_REGIONAL_KNOWLEDGE_ITEMS);

  return rows
    .filter((row) => {
      const content = row.content as KnowledgeContent | null;
      return !!content?.summary?.trim() && !!row.confidence && !!row.sourceReference?.trim();
    })
    .map((row) => ({
      knowledgeType: row.knowledgeType as KnowledgeTypeId,
      summary: (row.content as KnowledgeContent).summary.trim(),
      confidence: row.confidence as Confidence,
      sourceReference: (row.sourceReference as string).trim(),
    }));
}


// =============================================================================
// PHASE 13-2 — Knowledge-derived Place read path (B안: 전용 query + recommendation 단계
// 명시적 병합). PHASE 12에서 video_knowledge.place_id로 연결된 116건의 신규 places 행
// (externalSource IS NULL)을 실제 추천/일정 흐름에서 읽기 위한 전용 함수다.
//
// getConfirmedRegionalKnowledge()(프롬프트용 지역 지식)와 별개의 placeId 기반 경로다
// (PHASE 13-1 B안 결정: 두 카탈로그를 하나로 합치지 않는다).
// =============================================================================

/**
 * Knowledge-derived Place(§PlaceWithDetails와 구조적으로 호환)에 연결된 Knowledge 근거를
 * 함께 담은 타입. PlaceWithDetails를 그대로 extends해, getPlacesByRegion()이 반환하는 TourAPI
 * 장소와 동일한 필드 모양을 유지한다 — itinerary.ts가 이미 그 필드들
 * (category/overview/coordinateReliable 등)을 읽는 기존 로직을 그대로 재사용할 수 있게 하기
 * 위해서다. overview에는 이 장소와 연결된 Knowledge의 summary를 그대로 담아, 기존 p.overview
 * 참조 지점들이 별도 수정 없이도 Knowledge 근거를 자연히 전달받는다.
 */
export interface KnowledgeDerivedPlace extends PlaceWithDetails {
  source: "KNOWLEDGE_DERIVED";
  placeKnowledge: {
    knowledgeId: string;
    knowledgeType: KnowledgeTypeId;
    confidence: Confidence | null;
    sourceReference: string | null;
  };
}

// getKnowledgeDerivedPlacesByRegion()/getKnowledgeDerivedPlaceById() 공통 SELECT 행 모양.
interface KnowledgeDerivedPlaceRow {
  placeId: string;
  name: string;
  category: string;
  address: string | null;
  lat: string | null;
  lng: string | null;
  knowledgeId: string;
  knowledgeType: string;
  content: unknown;
  confidence: string | null;
  sourceReference: string | null;
  // PHASE 13-6 — 좌표 reliability 판정에 국내/해외 기준을 전달하기 위해서만 쓴다. 이 필드
  // 자체는 KnowledgeDerivedPlace(외부에 반환되는 타입)에는 노출하지 않는다(요구사항).
  domesticOverseas: string;
}

/** 두 함수가 공유하는 row→KnowledgeDerivedPlace 매핑. summary가 비어 있으면 null(제외 대상). */
function mapKnowledgeDerivedPlaceRow(row: KnowledgeDerivedPlaceRow): KnowledgeDerivedPlace | null {
  const content = row.content as KnowledgeContent | null;
  if (!content?.summary?.trim()) return null;
  return {
    id: row.placeId,
    name: row.name,
    category: row.category,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    // PHASE 13-6 — regions.domesticOverseas(이미 JOIN되어 있음)를 그대로 isCoordinateReliable()의
    // domestic 옵션으로 전달한다. 새 좌표 검증 로직 없음 — 기존 validateCoordinate()의 domestic
    // 옵션을 그대로 활용할 뿐이다.
    coordinateReliable: isCoordinateReliable(row.lat, row.lng, { domestic: row.domesticOverseas === "domestic" }),
    homepage: getHomepageDisplayStatus(null),
    tel: null,
    overview: content.summary.trim(),
    firstImage: null, // Knowledge-derived 장소는 유튜브 출처라 장소 사진 소스가 없다
    externalContentTypeId: null,
    categoryCode1: null,
    categoryCode2: null,
    detailData: null,
    source: "KNOWLEDGE_DERIVED",
    placeKnowledge: {
      knowledgeId: row.knowledgeId,
      knowledgeType: row.knowledgeType as KnowledgeTypeId,
      confidence: row.confidence as Confidence | null,
      sourceReference: row.sourceReference,
    },
  };
}

/**
 * regionCode로 그 지역에 속한 Place 중 video_knowledge.place_id로 실제 연결된 것만 조회한다
 * (PHASE 12-18에서 생성된 116건 — externalSource IS NULL). getPlacesByRegion()(TourAPI 전용,
 * queries.ts)과 provenance를 절대 섞지 않도록 이 함수는 별도로 둔다.
 *
 * 공개 품질 Gate: status='confirmed' AND publishable='yes'만 통과시킨다 — PHASE 10-0/STEP8-9
 * 검수 정책을 그대로 따르며, 이 함수가 그 정책을 우회하지 않는다. 하나의 place에 여러
 * confirmed knowledge 행이 연결된 경우(현재 실데이터는 1:1이지만 스키마상 가능) confidence
 * 우선순위로 대표 1건만 선택한다.
 */
export async function getKnowledgeDerivedPlacesByRegion(regionCode: string): Promise<KnowledgeDerivedPlace[]> {
  const db = getDb();

  const rows = await db
    .select({
      placeId: places.id,
      name: places.name,
      category: places.category,
      address: places.address,
      lat: places.lat,
      lng: places.lng,
      knowledgeId: videoKnowledge.id,
      knowledgeType: videoKnowledge.knowledgeType,
      content: videoKnowledge.content,
      confidence: videoKnowledge.confidence,
      sourceReference: videoKnowledge.sourceReference,
      // PHASE 13-6 — 이미 JOIN된 regions에서 한 컬럼만 추가로 가져온다(JOIN 구조 무변경).
      domesticOverseas: regions.domesticOverseas,
    })
    .from(places)
    .innerJoin(videoKnowledge, eq(videoKnowledge.placeId, places.id))
    .innerJoin(regions, eq(places.regionId, regions.id))
    .where(
      and(
        eq(regions.code, regionCode),
        isNull(places.externalSource),
        eq(videoKnowledge.status, "confirmed"),
        eq(videoKnowledge.publishable, "yes")
      )
    )
    .orderBy(
      sql`CASE ${videoKnowledge.confidence} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END`,
      asc(videoKnowledge.createdAt)
    );

  // 대표 1건만: place당 첫 행(위 정렬 기준 confidence가 가장 높은 행)을 채택한다.
  const byPlaceId = new Map<string, KnowledgeDerivedPlaceRow>();
  for (const row of rows) {
    if (!byPlaceId.has(row.placeId)) byPlaceId.set(row.placeId, row);
  }

  return Array.from(byPlaceId.values())
    .map(mapKnowledgeDerivedPlaceRow)
    .filter((p): p is KnowledgeDerivedPlace => p !== null);
}

const KNOWLEDGE_PLACE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PHASE 13-2 STEP5 — id(uuid) 하나로 Knowledge-derived Place 1건을 조회한다. queries.ts의
 * getPlaceById()(TourAPI 전용, externalSource='tour_api')는 무수정 — /places/[id]가 그 함수로
 * 먼저 조회해 없을 때만(즉 TourAPI 장소가 아닐 때만) 이 함수로 재조회하는 용도다. 상세
 * 페이지라고 공개 품질 Gate(confirmed+publishable='yes')를 낮추지 않는다 — getKnowledgeDerivedPlacesByRegion()과
 * 동일한 정책.
 */
export async function getKnowledgeDerivedPlaceById(id: string): Promise<KnowledgeDerivedPlace | null> {
  if (!KNOWLEDGE_PLACE_ID_RE.test(id)) return null;

  const db = getDb();
  const rows = await db
    .select({
      placeId: places.id,
      name: places.name,
      category: places.category,
      address: places.address,
      lat: places.lat,
      lng: places.lng,
      knowledgeId: videoKnowledge.id,
      knowledgeType: videoKnowledge.knowledgeType,
      content: videoKnowledge.content,
      confidence: videoKnowledge.confidence,
      sourceReference: videoKnowledge.sourceReference,
      // PHASE 13-6 — getKnowledgeDerivedPlacesByRegion()과 동일하게 regions를 JOIN해 한
      // 컬럼만 추가로 가져온다(이 함수는 원래 regions를 JOIN하지 않았으므로 신규 JOIN —
      // places.regionId → regions.id는 기존 스키마 관계를 그대로 쓸 뿐, 새 구조 아님).
      domesticOverseas: regions.domesticOverseas,
    })
    .from(places)
    .innerJoin(videoKnowledge, eq(videoKnowledge.placeId, places.id))
    .innerJoin(regions, eq(places.regionId, regions.id))
    .where(
      and(
        eq(places.id, id),
        isNull(places.externalSource),
        eq(videoKnowledge.status, "confirmed"),
        eq(videoKnowledge.publishable, "yes")
      )
    )
    .orderBy(
      sql`CASE ${videoKnowledge.confidence} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END`,
      asc(videoKnowledge.createdAt)
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return mapKnowledgeDerivedPlaceRow(row);
}
