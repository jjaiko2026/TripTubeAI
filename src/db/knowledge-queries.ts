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

// PHASE 12-1과 같은 상한 취지 — 지역당 노출되는 큐레이션 코스 수를 안전하게 제한한다.
const MAX_CONFIRMED_COURSES = 10;
// videoId 1건씩으로 접기 전에 넉넉히 가져와야 대표 선정 후에도 카드가 부족하지 않다.
const CONFIRMED_COURSE_FETCH_LIMIT = 60;

export interface ConfirmedCourseKnowledgeItem {
  id: string;
  knowledgeType: KnowledgeTypeId; // 이 함수는 항상 "course"만 반환한다
  summary: string;
  confidence: Confidence; // 내부 참고용 — 화면에는 노출하지 않는다
  sourceReference: string;
  video: {
    videoId: string;
    title: string;
    videoUrl: string;
    thumbnailUrl: string | null;
  };
}

// course 외 type(food/place/accommodation/shopping/experience) 카드 노출용 — 지역×type당
// 노출량 상한. MAX_CONFIRMED_COURSES와 같은 취지지만, "기존 상수는 변경하지 않는다"는 원칙에
// 따라 별도 상수로 둔다.
const MAX_CONFIRMED_KNOWLEDGE_ITEMS_BY_TYPE = 10;

/**
 * regionCode로 그 지역 영상들의 confirmed & knowledgeType="course" video_knowledge를 조회한다.
 * getConfirmedRegionalKnowledge()와 동일한 region 기반 연결(placeId 불필요)이며, 사람이 검수를
 * 마친 여행 코스를 있는 그대로(재요약/재판정 없이) 사용자 화면에 노출하기 위한 용도다.
 * confirmed course가 없으면 빈 배열을 반환한다 — 호출부가 이를 오류가 아니라 "아직 없음"으로
 * 다루도록 한다.
 */
export async function getConfirmedRegionalCourses(regionCode: string): Promise<ConfirmedCourseKnowledgeItem[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: videoKnowledge.id,
      knowledgeType: videoKnowledge.knowledgeType,
      content: videoKnowledge.content,
      confidence: videoKnowledge.confidence,
      sourceReference: videoKnowledge.sourceReference,
      videoId: videos.videoId,
      title: videos.title,
      videoUrl: videos.videoUrl,
      thumbnailUrl: videos.thumbnailUrl,
    })
    .from(videoKnowledge)
    .innerJoin(videos, eq(videoKnowledge.videoId, videos.videoId))
    .innerJoin(regions, eq(videos.regionId, regions.id))
    .where(
      and(
        eq(regions.code, regionCode),
        eq(videoKnowledge.status, "confirmed"),
        eq(videoKnowledge.knowledgeType, "course"),
        isNotNull(videoKnowledge.videoId)
      )
    )
    .orderBy(asc(videoKnowledge.createdAt))
    .limit(CONFIRMED_COURSE_FETCH_LIMIT);

  const withSummary = rows.filter((row) => {
    const content = row.content as KnowledgeContent | null;
    return !!content?.summary?.trim();
  });

  // 같은 영상에서 나온 코스는 대표 1건만 — /places가 같은 썸네일로 도배되지 않게 한다.
  const seenVideoIds = new Set<string>();
  const oneCardPerVideo = withSummary.filter((row) => {
    if (!row.videoId || seenVideoIds.has(row.videoId)) return false;
    seenVideoIds.add(row.videoId);
    return true;
  });

  return oneCardPerVideo.slice(0, MAX_CONFIRMED_COURSES).map((row) => ({
    id: row.id,
    knowledgeType: row.knowledgeType as KnowledgeTypeId,
    summary: (row.content as KnowledgeContent).summary.trim(),
    confidence: row.confidence as Confidence,
    sourceReference: (row.sourceReference ?? "").trim(),
    video: {
      videoId: row.videoId,
      title: row.title,
      videoUrl: row.videoUrl,
      thumbnailUrl: row.thumbnailUrl,
    },
  }));
}

// course 카드(getConfirmedRegionalCourses)와 필드는 겹치지만, PHASE 11-2에서 화면 표시 전용
// 필드(displayTitle/inCourse)가 추가로 필요해 별도 타입으로 분리한다 — course 쪽 타입/쿼리는
// 그대로 둔다(수정 금지 원칙).
export interface ConfirmedKnowledgeCardItem {
  id: string;
  knowledgeType: KnowledgeTypeId;
  summary: string;
  confidence: Confidence;
  sourceReference: string;
  video: {
    videoId: string;
    title: string;
    videoUrl: string;
    thumbnailUrl: string | null;
  };
  /** PHASE 11-2 GAP-1 — 카드 제목으로 쓸 표시용 텍스트. DB에 저장하지 않고 매 조회 시 런타임
   *  계산만 한다. 장소명 추출에 실패해도 억지로 만들어내지 않고 summary로 대체한다. */
  displayTitle: string;
  /** PHASE 11-2 GAP-2 — 같은 videoId가 이 지역의 confirmed course에도 존재하는지. course
   *  데이터/쿼리는 건드리지 않고, 이 카드에 배지를 붙이기 위한 참고 정보로만 쓴다. */
  inCourse: boolean;
}

// dedup 손실을 감안해 SQL 상한을 카드 노출 상한(10)보다 넉넉히 잡는다 — 지역×type 조합 중
// 가장 큰 표본(STEP2 감사 기준 서귀포시 food 36건 수준)도 넉넉히 커버하는 안전 여유치.
const CONFIRMED_KNOWLEDGE_FETCH_LIMIT = 100;

/**
 * summary/sourceReference에서 따옴표('...')로 특정된 상호/시설명을 dedup 키(및 카드 표시용
 * 이름) 후보로 추출한다. 품질 판정(A1/A2 등급)이 아니라 "같은 장소를 가리키는 서로 다른 행을
 * 묶기 위한 키"일 뿐이다 — 새로운 scoring 시스템이 아니라 단순 문자열 추출. 이름이 안 잡히면
 * null을 반환해 dedup 대상에서 제외한다(안전한 기본값 — 중복 여부를 알 수 없으면 그냥 노출).
 */
function extractDedupKey(summary: string, sourceReference: string): string | null {
  const match = `${summary} ${sourceReference}`.match(/'([^']{2,30})'/);
  return match ? match[1] : null;
}

// PHASE 11-2 RISK-2 — quotedName이 있어도 이 목록에 있으면(너무 일반적인 짧은 명사) freetext
// 포함 비교 대상에서 제외한다. PHASE 11-1 감사에서 "하브스난바파크스"⊂"난바 파크스"처럼 서로
// 다른 quotedName끼리의 부분 포함은 위험하다고 확인됐기 때문에 애초에 quotedName↔quotedName
// 포함 비교는 하지 않지만(기존과 동일하게 정확 일치만), 이 블록리스트는 quotedName↔freetext
// 비교에서도 "공원"처럼 짧고 흔한 단어가 우연히 다른 항목 텍스트에 등장해 오탐을 만드는 걸
// 막기 위한 추가 안전장치다.
const GENERIC_PLACE_WORDS = new Set(["공원", "시장", "해수욕장", "거리", "타워", "박물관", "신사", "성", "역"]);

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, "");
}

/**
 * getConfirmedRegionalCourses()를 knowledgeType 파라미터화한 범용 버전(ATKB 독립 콘텐츠
 * 모델, STEP6 감사 결과). course 전용 쿼리는 이미 프로덕션에서 검증돼 있어 그대로 두고
 * 건드리지 않으며, 이 함수는 course 외 5개 type(food/place/accommodation/shopping/
 * experience)을 위해 별도로 추가한다 — 로직은 동일하되 knowledgeType 필터만 파라미터로
 * 받는다. placeId/places 테이블은 여기서도 전혀 참조하지 않는다.
 *
 * 정렬(PHASE 11-2 RISK-1): status='confirmed'인 confidence 값(high/medium/low, AI 추출 시
 * 채워진 기존 필드 — 새로 판정하지 않음)을 기준으로 우선순위를 매겨, 10건 cap에서 잘리는
 * 순서를 개선한다. confidence가 같으면 기존 정렬(createdAt asc)로 안전하게 fallback한다.
 *
 * dedup(PHASE 11-2 RISK-2 보강): 1차로 동일 지역 내 동일 장소명(extractDedupKey, 따옴표 안
 * 텍스트)이 정확히 일치하는 행만 기존처럼 묶는다. 2차로, 아직 살아남은 행들에 대해 "이미 채택된
 * quotedName이 이 행의 원문 텍스트에 통째로 포함되는가"만 검사한다(quotedName끼리의 부분 문자열
 * 비교는 절대 하지 않는다 — PHASE 11-1 감사에서 "하브스난바파크스"⊂"난바 파크스"처럼 서로 다른
 * 장소가 잘못 합쳐질 위험이 실측 확인됐기 때문). 짧고 흔한 일반명사(GENERIC_PLACE_WORDS)는 이
 * 2차 검사에서 제외한다. 대표 선정은 1차와 동일하게 기존 정렬상 먼저 오는 행을 우선한다.
 *
 * STEP8/9 공개 품질 Gate — status='confirmed'만으로는 카드 공개 조건으로 부족하다는 STEP5/8
 * 감사 결론에 따라 publishable='yes'(Q9, 사람이 검수)까지 함께 요구한다. publishable이 아직
 * null(미검토)이거나 'no'(공개 부적합)인 행은 자동으로 제외된다 — null을 yes로 취급하지 않는다.
 * course(getConfirmedRegionalCourses)는 이 게이트 대상이 아니므로 그대로 둔다.
 */
export async function getConfirmedRegionalKnowledgeByType(
  regionCode: string,
  knowledgeType: KnowledgeTypeId
): Promise<ConfirmedKnowledgeCardItem[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: videoKnowledge.id,
      knowledgeType: videoKnowledge.knowledgeType,
      content: videoKnowledge.content,
      confidence: videoKnowledge.confidence,
      sourceReference: videoKnowledge.sourceReference,
      videoId: videos.videoId,
      title: videos.title,
      videoUrl: videos.videoUrl,
      thumbnailUrl: videos.thumbnailUrl,
    })
    .from(videoKnowledge)
    .innerJoin(videos, eq(videoKnowledge.videoId, videos.videoId))
    .innerJoin(regions, eq(videos.regionId, regions.id))
    .where(
      and(
        eq(regions.code, regionCode),
        eq(videoKnowledge.status, "confirmed"),
        eq(videoKnowledge.publishable, "yes"),
        eq(videoKnowledge.knowledgeType, knowledgeType),
        isNotNull(videoKnowledge.videoId)
      )
    )
    .orderBy(
      sql`CASE ${videoKnowledge.confidence} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END`,
      asc(videoKnowledge.createdAt)
    )
    .limit(CONFIRMED_KNOWLEDGE_FETCH_LIMIT);

  const withSummary = rows.filter((row) => {
    const content = row.content as KnowledgeContent | null;
    return !!content?.summary?.trim();
  });

  // 1차: quotedName 정확 일치 dedup(기존 로직 그대로) — 정렬이 confidence 기준으로 바뀌었으니
  // "가장 먼저인 행"의 의미도 자연히 "confidence 높은 행"으로 갱신된다(별도 우선순위 신설 아님).
  const seenExactKeys = new Set<string>();
  const acceptedQuotedNames: string[] = [];
  const passExact = withSummary.filter((row) => {
    const content = row.content as KnowledgeContent;
    const key = extractDedupKey(content.summary.trim(), row.sourceReference ?? "");
    if (key === null) return true;
    if (seenExactKeys.has(key)) return false;
    seenExactKeys.add(key);
    if (key.length >= 2 && !GENERIC_PLACE_WORDS.has(key)) acceptedQuotedNames.push(key);
    return true;
  });

  // 2차: 이미 채택된 quotedName이 (quotedName 없는) 행의 원문 텍스트에 통째로 포함되는지만 검사.
  // quotedName이 있는 행끼리는 여기서 다시 비교하지 않는다(1차에서 이미 정확 일치로 처리됨).
  const deduped = passExact.filter((row) => {
    const content = row.content as KnowledgeContent;
    const rowKey = extractDedupKey(content.summary.trim(), row.sourceReference ?? "");
    if (rowKey !== null) return true; // quotedName이 있는 행은 2차 검사 대상이 아님
    const rowText = normalizeForCompare(`${content.summary.trim()} ${row.sourceReference ?? ""}`);
    return !acceptedQuotedNames.some((name) => rowText.includes(normalizeForCompare(name)));
  });

  // 3차: 같은 영상에서 나온 카드는 대표 1건만 남긴다 — /places 섹션이 같은 유튜브 썸네일로
  // 반복 도배되지 않게 하기 위한 조치. 정렬(confidence→createdAt)상 먼저 오는 행이 대표가 된다.
  const seenVideoIds = new Set<string>();
  const oneCardPerVideo = deduped.filter((row) => {
    if (!row.videoId || seenVideoIds.has(row.videoId)) return false;
    seenVideoIds.add(row.videoId);
    return true;
  });

  const finalRows = oneCardPerVideo.slice(0, MAX_CONFIRMED_KNOWLEDGE_ITEMS_BY_TYPE);
  const courseVideoIds = finalRows.length > 0 ? await getConfirmedCourseVideoIds(regionCode) : new Set<string>();

  return finalRows.map((row) => {
    const content = row.content as KnowledgeContent;
    const summary = content.summary.trim();
    const quotedName = extractDedupKey(summary, row.sourceReference ?? "");
    return {
      id: row.id,
      knowledgeType: row.knowledgeType as KnowledgeTypeId,
      summary,
      confidence: row.confidence as Confidence,
      sourceReference: (row.sourceReference ?? "").trim(),
      video: {
        videoId: row.videoId,
        title: row.title,
        videoUrl: row.videoUrl,
        thumbnailUrl: row.thumbnailUrl,
      },
      displayTitle: quotedName ?? summary,
      inCourse: courseVideoIds.has(row.videoId),
    };
  });
}

/**
 * PHASE 11-2 GAP-2 — 이 지역의 confirmed course가 어떤 videoId에서 왔는지만 가볍게 조회한다.
 * getConfirmedRegionalCourses()(카드 렌더링용, thumbnail 등 포함)는 그대로 두고 건드리지 않으며,
 * 이 함수는 배지 표시 판단에만 쓸 videoId 목록이 필요해 별도로 최소하게 작성했다.
 */
async function getConfirmedCourseVideoIds(regionCode: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ videoId: videoKnowledge.videoId })
    .from(videoKnowledge)
    .innerJoin(videos, eq(videoKnowledge.videoId, videos.videoId))
    .innerJoin(regions, eq(videos.regionId, regions.id))
    .where(
      and(
        eq(regions.code, regionCode),
        eq(videoKnowledge.status, "confirmed"),
        eq(videoKnowledge.knowledgeType, "course"),
        isNotNull(videoKnowledge.videoId)
      )
    );
  return new Set(rows.map((r) => r.videoId as string));
}

// =============================================================================
// PHASE 13-2 — Knowledge-derived Place read path (B안: 전용 query + recommendation 단계
// 명시적 병합). PHASE 12에서 video_knowledge.place_id로 연결된 116건의 신규 places 행
// (externalSource IS NULL)을 실제 추천/일정 흐름에서 읽기 위한 전용 함수다.
//
// getConfirmedRegionalKnowledge()/getConfirmedRegionalKnowledgeByType()는 무수정 — 이 함수는
// 그 둘과 별개의 placeId 기반 경로다(PHASE 13-1 B안 결정: 두 카탈로그를 하나로 합치지 않는다).
// =============================================================================

/**
 * Knowledge-derived Place(§PlaceWithDetails와 구조적으로 호환)에 연결된 Knowledge 근거를
 * 함께 담은 타입. PlaceWithDetails를 그대로 extends해, getPlacesByRegion()이 반환하는 TourAPI
 * 장소와 동일한 필드 모양을 유지한다 — itinerary.ts/place-recommendation.ts가 이미 그 필드들
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
 * 공개 품질 Gate: getConfirmedRegionalKnowledgeByType()과 동일하게 status='confirmed' AND
 * publishable='yes'만 통과시킨다 — PHASE 10-0/STEP8-9 검수 정책을 그대로 따르며, 이 함수가
 * 그 정책을 우회하지 않는다. 하나의 place에 여러 confirmed knowledge 행이 연결된 경우(현재
 * 실데이터는 1:1이지만 스키마상 가능) confidence 우선순위로 대표 1건만 선택한다
 * (getConfirmedRegionalKnowledgeByType()의 정렬 관례와 동일).
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
