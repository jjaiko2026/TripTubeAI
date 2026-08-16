import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Source, TripTips } from "@/lib/types";
import type { TripPurpose } from "@/lib/purposes";

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

// 한국관광공사 TourAPI(KorService2) areaBasedList2/searchKeyword2 원본 응답을 정규화해
// 캐싱합니다. source_cache(유튜브/블로그)와 성격이 달라(장소 데이터, 30일보다 긴 TTL이 적합)
// 별도 테이블로 둡니다 (PRD-v2.6 draft §19.1.9).
export const tourPlaceCache = pgTable("tour_place_cache", {
  cacheKey: text("cache_key").primaryKey(), // `${areaCode}::${contentTypeId}` 형태
  places: jsonb("places").$type<{ title: string; tags: string[] }[]>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Content AI (PRD-v2.6 draft §39-45) ────────────────────────────────
// 관리자가 선택한 여행 일정 하나를 Blog/YouTube/Shorts 콘텐츠로 확장하는 파이프라인.
// 사용자용 화면에서는 절대 트리거하지 않고(Rule: 콘텐츠 생성은 관리자 영역에서만
// 시작), 일정 생성과는 별개의 운영 비용으로 취급한다.

export const contentJobs = pgTable("content_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  itineraryId: uuid("itinerary_id").notNull(),
  type: text("type").notNull(), // "blog" | "youtube" | "shorts" | "bundle"
  status: text("status").notNull(), // queued|researching|generating|review_required|failed
  requestedBy: text("requested_by").notNull(),
  options: jsonb("options").$type<{ blog?: boolean; youtube?: boolean; shorts?: boolean; shortCount?: number }>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const travelContentBriefs = pgTable("travel_content_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  itineraryId: uuid("itinerary_id").notNull(),
  brief: jsonb("brief").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const blogContents = pgTable("blog_contents", {
  id: uuid("id").primaryKey().defaultRandom(),
  itineraryId: uuid("itinerary_id").notNull(),
  jobId: uuid("job_id").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  markdown: text("markdown").notNull(),
  status: text("status").notNull(), // review_required|changes_requested
  guardIssues: jsonb("guard_issues"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const youtubeContents = pgTable("youtube_contents", {
  id: uuid("id").primaryKey().defaultRandom(),
  itineraryId: uuid("itinerary_id").notNull(),
  jobId: uuid("job_id").notNull(),
  title: text("title").notNull(),
  script: jsonb("script").notNull(),
  status: text("status").notNull(),
  guardIssues: jsonb("guard_issues"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shortsContents = pgTable("shorts_contents", {
  id: uuid("id").primaryKey().defaultRandom(),
  itineraryId: uuid("itinerary_id").notNull(),
  jobId: uuid("job_id").notNull(),
  title: text("title").notNull(),
  script: jsonb("script").notNull(),
  status: text("status").notNull(),
  guardIssues: jsonb("guard_issues"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
