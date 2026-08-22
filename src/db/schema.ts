import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Source, TripTips } from "@/lib/types";
import type { TripPurpose } from "@/lib/purposes";
import type { ContentTypeId, KnowledgeContent } from "@/lib/knowledge/types";

export const itineraries = pgTable("itineraries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  destination: text("destination").notNull(),
  destinationName: text("destination_name").notNull(),
  region: text("region").notNull().default("국내"),
  memberType: text("member_type").notNull(),
  memberCount: integer("member_count").notNull(),
  nights: integer("nights").notNull(),
  month: integer("month").notNull(),
  // 구버전(한글 문자열 배열)과 신버전({id, priority}[])이 섞여 있을 수 있어 조회 시
  // normalizeTripPurposes로 정규화합니다 (src/lib/purposes.ts, src/db/queries.ts).
  purposes: jsonb("purposes").$type<TripPurpose[]>().notNull(),
  // 특정 날짜 지역 지정, 꼭 가고 싶은 장소 등 사용자가 입력한 자유 텍스트 요청사항.
  // "조건 다시 입력" 시 폼을 이전 값으로 복원하기 위해 저장합니다 (src/app/plan/new/page.tsx).
  // 이 컬럼이 생기기 전에 저장된 일정은 null이라, 조회 시 빈 값으로 대체합니다 (src/db/queries.ts).
  notes: text("notes"),
  days: jsonb("days").notNull(),
  estimatedTotalCost: integer("estimated_total_cost").notNull(),
  currency: text("currency").notNull().default("KRW"),
  // 기후/준비물/최근 이슈 정보(로딩 중 Tip으로도 노출). 이 컬럼이 생기기 전에 저장된
  // 기존 일정은 null이라, 조회 시 빈 값으로 대체합니다 (src/db/queries.ts).
  tripTips: jsonb("trip_tips").$type<TripTips>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 검색어(query) 하나당 유튜브+네이버에서 골라낸 소스 후보를 캐싱해, 여러 사용자의 일정이
// 같은 장소를 검색할 때 유튜브/네이버 API를 반복 호출하지 않도록 합니다. 유튜브 API
// 이용약관상 원본 데이터는 30일 이내 갱신/삭제해야 하므로, fetchedAt 기준 30일이 지나면
// 캐시를 쓰지 않고 다시 조회합니다 (src/db/source-cache.ts).
export const sourceCache = pgTable("source_cache", {
  query: text("query").primaryKey(),
  sources: jsonb("sources").$type<Source[]>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

// 목적지+지역+월 단위로 기후/준비물/최근 이슈 AI 생성 결과를 캐싱합니다. 로딩 화면에서
// 클라이언트가 먼저 호출(/api/trip-tips)하고, 일정 생성 서버 액션도 같은 캐시를 참조하므로
// 보통 AI 호출 한 번으로 로딩 Tip과 완성된 일정 카드가 같은 내용을 보여줍니다 (src/lib/trip-tips.ts).
export const tripTipsCache = pgTable("trip_tips_cache", {
  key: text("key").primaryKey(),
  tips: jsonb("tips").$type<TripTips>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

// 관리자가 Google Sheets(CONTENT_MASTER)에서 검수한 소스(유튜브/블로그)의 승인/거부 상태.
// sourceId는 Source.id(유튜브 videoId 또는 블로그 URL)와 같아, 여러 검색어의 캐시 결과에
// 같은 소스가 나오더라도 하나의 판정으로 전체에 적용됩니다 (src/lib/sheets/content-sheet.ts).
export const contentModeration = pgTable("content_moderation", {
  sourceId: text("source_id").primaryKey(),
  status: text("status").notNull(), // "approved" | "rejected"
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 같은 검색어(cacheKey)를 여러 요청이 동시에 실검색하지 않도록 거는 락 (PRD §10 Request
// Deduplication). 별도 워커/큐 없이 요청 처리 안에서만 쓰이므로, PRD의 search_jobs +
// search_locks 조합 대신 이 락 테이블 하나로 단순화했습니다 — expiresAt이 지나면
// 락 보유자가 비정상 종료된 것으로 보고 다음 요청이 넘겨받습니다 (src/db/search-lock.ts).
export const searchLocks = pgTable("search_locks", {
  cacheKey: text("cache_key").primaryKey(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// 외부 API(현재는 YouTube)의 일일 호출 횟수를 세는 카운터 (PRD §12 Rate Limiter).
// id는 `${api}::${yyyy-mm-dd}` 형태라 날짜가 바뀌면 자연히 새 행으로 리셋됩니다.
export const apiRateLimits = pgTable("api_rate_limits", {
  id: text("id").primaryKey(),
  count: integer("count").notNull().default(0),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  author: text("author").notNull(),
  destination: text("destination").notNull(),
  rating: integer("rating").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tripMonth: integer("trip_month").notNull(),
  nights: integer("nights").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// ATKB 여행 지식 계층 (신규, additive) — docs/IMPLEMENTATION_PHASES.md Phase 1-A
//
// 위 7개 테이블(itineraries ~ reviews)은 이 섹션에서 전혀 수정하지 않는다. 아래 10개 테이블은
// 기존 요청형 검색 파이프라인(itinerary.ts)과는 별도로 동작하는 축적형 지식 수집 파이프라인
// 전용이며, 기존 테이블을 참조하는 FK가 하나도 없다(docs/SCHEMA_REVIEW.md §9).
// =============================================================================

// 지역 계층(대륙→국가→지역/권역→도시→세부지역 / 대한민국→시도→시군구→세부지역).
// parentRegionId 자기참조로 트리를 구성한다 (docs/REGION_RULES.md §1).
export const regions = pgTable(
  "regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 사람이 읽는 안정 식별자 (예: "KR-JEJU-AEWOL", "JP-OSAKA"). PK는 아니다.
    code: text("code").notNull(),
    parentRegionId: uuid("parent_region_id").references((): AnyPgColumn => regions.id),
    level: text("level").notNull(), // RegionLevel (src/lib/knowledge/types.ts)
    domesticOverseas: text("domestic_overseas").notNull(), // "domestic" | "overseas"
    nameKo: text("name_ko").notNull(),
    nameLocal: text("name_local"),
    countryCode: text("country_code"), // ISO 3166-1 alpha-2, 해외만
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("review"), // "confirmed" | "review" | "excluded"
    // 예: "JEJU_DIRECTIONAL" | "MULTI_REGION" — status가 excluded일 때만 채운다.
    exclusionReason: text("exclusion_reason"),
    // TourAPI 지역코드 매핑 (Phase 3-C, docs/TOUR_API_DATA_MODEL_REVIEW.md §4). TourAPI 하나만
    // 매핑 대상인 동안은 별도 매핑 테이블 대신 컬럼으로 둔다 — 두 번째 외부 지역코드 체계가
    // 필요해지면 그때 별도 테이블로 리팩터링한다. UNIQUE 없음: 같은 areaCode를 제주시/서귀포시가
    // sigunguCode로만 구분해 공유한다.
    tourApiAreaCode: text("tour_api_area_code"),
    tourApiSigunguCode: text("tour_api_sigungu_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("regions_code_idx").on(table.code),
    index("regions_parent_region_id_idx").on(table.parentRegionId),
    index("regions_domestic_overseas_level_idx").on(table.domesticOverseas, table.level),
  ]
);

// 블로그 등 YouTube가 아닌 출처. YouTube 영상은 아래 videos 테이블이 전담하므로(중복 방지 목적상
// videoId를 PK로 쓰기 위해 별도 테이블로 분리, docs/CURRENT_SYSTEM_ANALYSIS.md §6 참고),
// sources.sourceType은 현재 "blog"만 쓰지만 향후 다른 텍스트 출처(공식 홈페이지 등)를 위해
// 자유 text로 둔다.
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: text("source_type").notNull(), // "blog" | ...
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    publisher: text("publisher"), // 사이트명/작성자
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // 이 파이프라인이 이 출처를 발견/조회한 시각. publishedAt(원문 게시 시각)과 절대 혼동하지
    // 않는다 — 최신성 판단은 이 값이 아니라 publishedAt 기준이다.
    searchedAt: timestamp("searched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sources_source_url_idx").on(table.sourceUrl)]
);

// YouTube 영상 메타데이터. 영상 파일은 저장하지 않는다 — API가 제공하는 공개 메타데이터만
// 저장한다 (docs/YOUTUBE_RULES.md §1). videoId를 PK로 써서 "동일 Video ID 중복 저장 금지"를
// DB 제약(Postgres primary key = unique + not null)으로 강제한다(docs/YOUTUBE_RULES.md §3).
export const videos = pgTable(
  "videos",
  {
    videoId: text("video_id").primaryKey(),
    videoUrl: text("video_url").notNull(),
    title: text("title").notNull(),
    channelId: text("channel_id"),
    channelName: text("channel_name"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    description: text("description"),
    durationLabel: text("duration_label"),
    viewCount: integer("view_count"),
    thumbnailUrl: text("thumbnail_url"),
    // 이 파이프라인이 이 영상을 검색/발견한 시각. publishedAt과 절대 같은 의미로 쓰지 않는다
    // (사용자 확정 사항 — docs/DATA_SCHEMA_PROPOSAL.md §5).
    searchedAt: timestamp("searched_at", { withTimezone: true }).notNull().defaultNow(),
    regionId: uuid("region_id").references(() => regions.id), // 분류 전에는 null
    contentTypes: jsonb("content_types").$type<ContentTypeId[]>().notNull().default([]),
    // VideoPipelineStatus: "discovered" | "filtered" | "classified" | "extracted" |
    // "normalized" | "verified"
    status: text("status").notNull().default("discovered"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("videos_region_id_idx").on(table.regionId),
    index("videos_searched_at_idx").on(table.searchedAt),
    index("videos_channel_id_idx").on(table.channelId),
  ]
);

// 정규화된 장소. 좌표는 기존 geocodeProvider(src/lib/geo/geocode-provider.ts, 무변경)로 얻은
// 결과를 여기 영속 저장해, 같은 장소를 다시 지오코딩하지 않도록 한다.
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    regionId: uuid("region_id")
      .notNull()
      .references(() => regions.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    category: text("category").notNull(), // "tourism" | "food" | "accommodation" | ...
    address: text("address"),
    lat: text("lat"), // 문자열로 저장(정밀도 손실 방지) — 조회 시 Number() 변환
    lng: text("lng"),
    // 이 장소가 처음 발견된 영상/출처 (검수 화면에서 "어디서 나왔는가" 바로 보여주기 위한 편의
    // 필드). 정식 근거 추적은 video_knowledge.placeId 쪽 조인이 우선이다 — 이 필드는 참고용.
    firstSeenVideoId: text("first_seen_video_id").references(() => videos.videoId),
    firstSeenSourceId: uuid("first_seen_source_id").references(() => sources.id),
    status: text("status").notNull().default("review"), // "confirmed" | "review" | "excluded"
    // TourAPI(공식 관광정보) 연동 컬럼 (Phase 3-C, docs/TOUR_API_DATA_MODEL_REVIEW.md). 전부
    // nullable — YouTube/Naver 유래 place는 계속 null이다. TourAPI는 sources 테이블에 넣지 않고
    // 여기 places에 직접 저장한다(§3) — externalSource="tour_api"로 채운다.
    //
    // 원칙: externalSource가 채워진 행은 name/normalizedName/address/lat/lng/category를 이후
    // 어떤 파이프라인(AI 추출 포함)도 UPDATE하지 않는다 — TourAPI 원본이 우선한다(§6).
    externalSource: text("external_source"), // "tour_api" 등
    externalContentId: text("external_content_id"), // TourAPI contentid
    externalContentTypeId: text("external_content_type_id"), // TourAPI contenttypeid, 원본 그대로 보존
    categoryCode1: text("category_code1"), // TourAPI cat1 (대분류)
    categoryCode2: text("category_code2"), // TourAPI cat2 (중분류)
    categoryCode3: text("category_code3"), // TourAPI cat3 (소분류)
    homepage: text("homepage"),
    tel: text("tel"),
    overview: text("overview"),
    // TourAPI 원본 갱신 시각(modifiedtime, YYYYMMDDHHmmss 파싱). 우리 시스템이 손댄 시각인
    // updatedAt과 의미가 다르다 — 파싱 실패/빈 값은 에러 대신 null로 처리한다.
    externalModifiedAt: timestamp("external_modified_at", { withTimezone: true }),
    externalAreaCode: text("external_area_code"), // TourAPI areaCode, regions 매핑 재계산용 원본 보존
    externalSigunguCode: text("external_sigungu_code"), // TourAPI sigunguCode
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("places_region_id_idx").on(table.regionId),
    index("places_normalized_name_idx").on(table.normalizedName),
    index("places_region_id_normalized_name_idx").on(table.regionId, table.normalizedName),
    // 단독 externalContentId UNIQUE는 만들지 않는다 — 향후 다른 공급원이 같은 ID 값을 쓸 수
    // 있어 충돌 위험이 있다(§2). Postgres 복합 UNIQUE는 두 컬럼 중 하나라도 NULL이면 유일성
    // 검사에서 제외되므로, YouTube/Naver 유래로 두 컬럼이 전부 null인 기존 행들과 충돌하지 않는다.
    uniqueIndex("places_external_source_content_id_idx").on(
      table.externalSource,
      table.externalContentId
    ),
  ]
);

// AI(또는 관리자)가 영상/출처에서 추출한 여행 지식. 원본 사실과 AI 해석을 구분하기 위해
// extractionMethod + confidence + sourceReference를 항상 함께 저장한다
// (docs/KNOWLEDGE_EXTRACTION.md §3). videoId/sourceRefId 중 정확히 하나만 채운다 — Phase 1-B-1
// 검토에서 Drizzle 0.45.2가 실제 CHECK 제약 SQL을 생성할 수 있음을 확인해, DB 레벨로 강제한다.
export const videoKnowledge = pgTable(
  "video_knowledge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: text("video_id").references(() => videos.videoId),
    sourceRefId: uuid("source_ref_id").references(() => sources.id),
    placeId: uuid("place_id").references(() => places.id), // 아직 정규화 전이면 null
    knowledgeType: text("knowledge_type").notNull(), // KnowledgeTypeId
    content: jsonb("content").$type<KnowledgeContent>().notNull(),
    extractionMethod: text("extraction_method").notNull(), // "ai" | "manual"
    // 원문의 어느 부분에서 나왔는지(가능하면 인용, 최소한 "제목/설명 중 어디" 구분).
    sourceReference: text("source_reference"),
    confidence: text("confidence"), // "high" | "medium" | "low", AI 추출일 때만
    status: text("status").notNull().default("unverified"), // "confirmed" | "review" | "unverified" | "rejected"
    // PHASE 10-0 Knowledge Review Contract Q1-Q8 — 사람 검수 결과를 재현 가능하게 남긴다.
    // "장소를 텍스트로 식별할 수 있는가"(placeIdentifiable)와 "실제 Place FK가 매칭됐는가"(placeId)는
    // 서로 다른 질문이다 — PHASE 11-2부터 confirmed는 콘텐츠 검수(Q1/Q2/Q3/Q5/Q6) 통과만으로
    // 가능하며, placeId 매칭(Place Resolution)은 독립된 후속 단계로 분리한다(모든 knowledgeType 동일).
    evidenceConfirmed: text("evidence_confirmed"), // Q1: "yes" | "partial" | "no"
    contentAccuracy: text("content_accuracy"), // Q2: "yes" | "needs_fix" | "no"
    regionRelevance: text("region_relevance"), // Q3: "yes" | "partial" | "no"
    placeIdentifiable: text("place_identifiable"), // Q4: "yes" | "candidate" | "no", 검수자가 Q4에 답한 값
    serviceValue: text("service_value"), // Q5: "yes" | "low" | "no"
    recommendationSafety: text("recommendation_safety"), // Q6: "safe" | "caution" | "unsafe"
    reviewer: text("reviewer"), // 검수자 식별자(이메일 등), 검수 전에는 null
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }), // 검수 시각, 검수 전에는 null
    reviewNote: text("review_note"), // Q8 — 다른 검수자가 재현 가능하도록 남기는 한 줄 근거
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("video_knowledge_video_id_idx").on(table.videoId),
    index("video_knowledge_source_ref_id_idx").on(table.sourceRefId),
    index("video_knowledge_place_id_idx").on(table.placeId),
    index("video_knowledge_status_idx").on(table.status),
    // videoId(YouTube 원본) 또는 sourceRefId(블로그 등 sources 원본) 중 정확히 하나만 채워야
    // 한다 — 둘 다 null이거나 둘 다 채워진 행은 DB가 거부한다.
    check(
      "video_knowledge_exactly_one_origin_check",
      sql`(${table.videoId} IS NOT NULL) <> (${table.sourceRefId} IS NOT NULL)`
    ),
    // PHASE 10-0 Q7 confirmed 조건: Q1/Q2/Q3/Q5/Q6가 전부 통과값이어야 confirmed 가능.
    // place_identifiable/placeId 조건은 여기 넣지 않는다(앱 레벨 규칙으로 유지하기로 결정).
    check(
      "video_knowledge_confirmed_requires_all_checks",
      sql`${table.status} <> 'confirmed' OR (
        ${table.evidenceConfirmed} = 'yes' AND
        ${table.contentAccuracy} = 'yes' AND
        ${table.regionRelevance} = 'yes' AND
        ${table.serviceValue} = 'yes' AND
        ${table.recommendationSafety} = 'safe'
      )`
    ),
    // 검수가 끝난 상태(confirmed/review/rejected)라면 누가 언제 검수했는지 반드시 남아 있어야 한다.
    check(
      "video_knowledge_reviewed_status_requires_reviewer",
      sql`${table.status} = 'unverified' OR (${table.reviewer} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL)`
    ),
  ]
);

// 장소 간 관계 (인접/추천 동선/도보·대중교통 경로/같은 구역/같은 테마 등).
export const placeRelations = pgTable(
  "place_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromPlaceId: uuid("from_place_id")
      .notNull()
      .references(() => places.id),
    toPlaceId: uuid("to_place_id")
      .notNull()
      .references(() => places.id),
    relationType: text("relation_type").notNull(), // RelationType
    basis: text("basis"), // 근거 (예: "같은 코스에 3회 이상 함께 등장")
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // 같은 두 장소 사이에 같은 유형의 관계가 중복 저장되는 것을 막는다.
    uniqueIndex("place_relations_from_to_type_idx").on(
      table.fromPlaceId,
      table.toPlaceId,
      table.relationType
    ),
    index("place_relations_from_place_id_idx").on(table.fromPlaceId),
    index("place_relations_to_place_id_idx").on(table.toPlaceId),
  ]
);

// 기존 콘텐츠(영상/블로그)에서 발견된 여행코스. 향후 1일~4일 이상의 코스 구축에 쓰인다
// (docs/DATA_SCHEMA_PROPOSAL.md §8). 사용자가 매 요청마다 생성하는 itineraries.days(JSONB)와는
// 별개 — travelCourses는 "발견된 코스", itineraries는 "그때그때 생성한 결과물"이다.
export const travelCourses = pgTable(
  "travel_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    regionId: uuid("region_id")
      .notNull()
      .references(() => regions.id),
    title: text("title").notNull(),
    durationDays: integer("duration_days").notNull(),
    videoId: text("video_id").references(() => videos.videoId),
    sourceRefId: uuid("source_ref_id").references(() => sources.id),
    description: text("description"),
    status: text("status").notNull().default("review"), // "confirmed" | "review" | "excluded"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("travel_courses_region_id_idx").on(table.regionId),
    // videoKnowledge와 동일한 배타조건 — 코스는 항상 발견된 원본(영상 또는 블로그)이 있어야 한다.
    check(
      "travel_courses_exactly_one_origin_check",
      sql`(${table.videoId} IS NOT NULL) <> (${table.sourceRefId} IS NOT NULL)`
    ),
  ]
);

export const courseItems = pgTable(
  "course_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => travelCourses.id),
    day: integer("day").notNull(),
    orderInDay: integer("order_in_day").notNull(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id),
    dwellMinutes: integer("dwell_minutes"),
    travelMethod: text("travel_method"), // "도보" | "대중교통" | "차량" 등, 자유 텍스트
    note: text("note"),
  },
  (table) => [
    index("course_items_course_id_idx").on(table.courseId),
    // 같은 코스의 같은 날짜에 같은 순번이 중복 배정되는 것을 막는다.
    uniqueIndex("course_items_course_day_order_idx").on(table.courseId, table.day, table.orderInDay),
  ]
);

// 검색 실행 이력. 결과 데이터(videos/sources)와는 별개로, "언제 어떤 조건으로 검색했는지"만
// 감사 기록으로 남긴다 (docs/DATA_SCHEMA_PROPOSAL.md §9).
export const searchLog = pgTable(
  "search_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyword: text("keyword").notNull(),
    domesticOverseas: text("domestic_overseas"),
    continent: text("continent"),
    country: text("country"),
    regionText: text("region_text"), // 검색 시점에 지정한 원문 지역 표현
    city: text("city"),
    contentType: text("content_type"),
    // 검색 실행 시점(searchedAt) 기준으로 동적 계산된 값을 결과로 저장한다 — 코드에 고정
    // 날짜를 두지 않는다(docs/YOUTUBE_RULES.md §2).
    dateFrom: timestamp("date_from", { withTimezone: true }).notNull(),
    dateTo: timestamp("date_to", { withTimezone: true }).notNull(),
    searchedAt: timestamp("searched_at", { withTimezone: true }).notNull().defaultNow(),
    resultCount: integer("result_count").notNull().default(0),
    acceptedCount: integer("accepted_count").notNull().default(0),
    excludedCount: integer("excluded_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
  },
  (table) => [
    index("search_log_searched_at_idx").on(table.searchedAt),
    index("search_log_keyword_idx").on(table.keyword),
  ]
);

// 정식 지식 데이터로 승격하지 않은 영상의 제외 사유. 삭제가 아니라 사유 보존이 목적이라
// videos 행 자체는 그대로 둔 채 이 테이블에만 기록한다 — 향후 알고리즘 개선 시 재처리할 수
// 있게 한다(docs/REGION_RULES.md §3).
export const excludedVideo = pgTable(
  "excluded_video",
  {
    videoId: text("video_id")
      .primaryKey()
      .references(() => videos.videoId),
    // ExcludedVideoReason: "MULTI_REGION" | "REGION_UNCLEAR" | "JEJU_DIRECTIONAL" |
    // "OLDER_THAN_ONE_YEAR" | "DUPLICATE" | "IRRELEVANT" | "REVIEW_REQUIRED"
    reason: text("reason").notNull(),
    note: text("note"),
    excludedAt: timestamp("excluded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("excluded_video_reason_idx").on(table.reason)]
);

// TourAPI detailIntro2(유형별 상세정보) 전용 (Phase 3-F, docs/PHASE3F_DATA_MODEL_PROPOSAL.md).
// 관광지/문화시설/음식점/숙박 등 콘텐츠유형마다 필드셋이 완전히 다르므로(§3~§4), places에
// 유형별 컬럼을 추가하지 않고 원본 필드명 그대로 JSONB로 보존한다. AI가 이 테이블을
// 절대 UPDATE하지 않는다 — TourAPI 원본 전용 계층이며 video_knowledge(AI 해석)와는
// FK로 연결하지 않아 원본/AI 계층을 분리 유지한다(§15).
export const placeTourismDetails = pgTable(
  "place_tourism_details",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id),
    contentTypeId: text("content_type_id").notNull(), // TourAPI contenttypeid 원본 그대로("12"/"14"/"32"/"39" 등)
    detailData: jsonb("detail_data").notNull(), // detailIntro2 원본 필드를 키 이름 그대로 보존(contentid/contenttypeid 제외)
    source: text("source").notNull().default("tour_api"), // 향후 다른 공급원 대비(§16) — nullable이 아님, 이 테이블은 항상 출처가 있어야 의미가 있다
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(), // TourAPI에서 마지막으로 가져온 시각(우리가 편집한 시각이 아님)
  },
  (table) => [
    uniqueIndex("place_tourism_details_place_content_type_idx").on(table.placeId, table.contentTypeId),
    index("place_tourism_details_content_type_id_idx").on(table.contentTypeId),
  ]
);

// PHASE 13-2 — Pipeline B(TourAPI/Knowledge 기반 추천→일정 생성) 전용 실사용 이벤트 로그.
// itineraries(Pipeline A/B 공용 결과 저장소)와 별개로, "그 결과가 어떤 사용자 행동을 거쳐
// 나왔는지"만 기록한다. Pipeline A(YouTube/Naver 기존 파이프라인, src/lib/itinerary.ts)의
// 어떤 코드 경로도 이 테이블에 쓰지 않으므로, 이 테이블에 쌓이는 데이터는 정의상 전부
// Pipeline B 데이터다 — 별도 pipeline 구분 컬럼이나 기존 34건에 대한 소급 입력이 필요 없다.
// FK를 걸지 않는다(분석 로그가 참조 무결성 실패로 사용자 흐름을 막으면 안 된다는 원칙,
// video_knowledge/travel_courses 같은 핵심 데이터 테이블과는 성격이 다르다).
export const pipelineBEvents = pgTable(
  "pipeline_b_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // "recommend_executed" | "place_selected" | "plan_generate_requested" |
    // "itinerary_completed" | "place_detail_viewed"
    eventType: text("event_type").notNull(),
    userId: text("user_id"), // 비로그인 상태에서도 볼 수 있는 단계(추천 조회, 장소 상세)가 있어 nullable
    regionCode: text("region_code"),
    placeId: uuid("place_id"),
    itineraryId: uuid("itinerary_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pipeline_b_events_event_type_idx").on(table.eventType),
    index("pipeline_b_events_created_at_idx").on(table.createdAt),
  ]
);
