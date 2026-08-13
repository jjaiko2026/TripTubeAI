import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Source } from "@/lib/types";

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
  purposes: jsonb("purposes").$type<string[]>().notNull(),
  days: jsonb("days").notNull(),
  estimatedTotalCost: integer("estimated_total_cost").notNull(),
  currency: text("currency").notNull().default("KRW"),
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

// 관리자가 Google Sheets(CONTENT_MASTER)에서 검수한 소스(유튜브/블로그)의 승인/거부 상태.
// sourceId는 Source.id(유튜브 videoId 또는 블로그 URL)와 같아, 여러 검색어의 캐시 결과에
// 같은 소스가 나오더라도 하나의 판정으로 전체에 적용됩니다 (src/lib/sheets/content-sheet.ts).
export const contentModeration = pgTable("content_moderation", {
  sourceId: text("source_id").primaryKey(),
  status: text("status").notNull(), // "approved" | "rejected"
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
