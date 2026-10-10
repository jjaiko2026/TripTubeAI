import { desc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { itineraries, reviews } from "@/db/schema";
import type { ItineraryDay } from "@/lib/types";
import { normalizeTripPurposes, PURPOSE_LABELS } from "@/lib/purposes";

/**
 * 관리자 페이지(/admin)의 "요청 로그" 표. 고객 요청 1건(itineraries 행) = 표의 1줄.
 * 줄이 길어지지 않도록 days/purposes 같은 큰 JSON은 여기서 집계값(일수·항목수·라벨)으로
 * 접어서 넘기고, 원본 전체는 각 줄의 /plan/result/[id] 링크로 확인한다.
 */
export interface AdminItineraryRow {
  id: string;
  createdAt: string;
  userId: string | null;
  destinationName: string;
  region: string;
  memberType: string;
  memberCount: number;
  nights: number;
  month: number;
  purposeLabels: string[];
  notes: string | null;
  dayCount: number;
  itemCount: number;
  estimatedTotalCost: number;
  currency: string;
  /** 이 일정 결과 페이지에서 작성된 후기(reviews.itineraryId 일치). 없으면 null. */
  review: { rating: number; title: string; createdAt: string } | null;
}

export async function getAdminItineraryRows(limit = 200): Promise<AdminItineraryRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: itineraries.id,
      createdAt: itineraries.createdAt,
      userId: itineraries.userId,
      destinationName: itineraries.destinationName,
      region: itineraries.region,
      memberType: itineraries.memberType,
      memberCount: itineraries.memberCount,
      nights: itineraries.nights,
      month: itineraries.month,
      purposes: itineraries.purposes,
      notes: itineraries.notes,
      days: itineraries.days,
      estimatedTotalCost: itineraries.estimatedTotalCost,
      currency: itineraries.currency,
    })
    .from(itineraries)
    .orderBy(desc(itineraries.createdAt))
    .limit(limit);

  // 후기는 itineraryId당 여러 개일 수 있어(스키마상 UNIQUE 아님) 조인 대신 따로 읽어
  // itineraryId → 가장 최근 후기 1건으로 매핑한다("1요청 1줄" 유지).
  const ids = rows.map((r) => r.id);
  const reviewRows =
    ids.length > 0
      ? await db
          .select({
            itineraryId: reviews.itineraryId,
            rating: reviews.rating,
            title: reviews.title,
            createdAt: reviews.createdAt,
          })
          .from(reviews)
          .where(inArray(reviews.itineraryId, ids))
      : [];

  const latestReview = new Map<string, { rating: number; title: string; createdAt: string }>();
  for (const rv of reviewRows) {
    if (!rv.itineraryId) continue;
    const prev = latestReview.get(rv.itineraryId);
    if (!prev || rv.createdAt.toISOString() > prev.createdAt) {
      latestReview.set(rv.itineraryId, {
        rating: rv.rating,
        title: rv.title,
        createdAt: rv.createdAt.toISOString(),
      });
    }
  }

  return rows.map((row) => {
    const days = (row.days as ItineraryDay[] | null) ?? [];
    const purposeLabels = normalizeTripPurposes(row.purposes)
      .map((p) => PURPOSE_LABELS[p.id])
      .filter(Boolean);
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      userId: row.userId,
      destinationName: row.destinationName,
      region: row.region,
      memberType: row.memberType,
      memberCount: row.memberCount,
      nights: row.nights,
      month: row.month,
      purposeLabels,
      notes: row.notes,
      dayCount: days.length,
      itemCount: days.reduce((sum, d) => sum + (d.items?.length ?? 0), 0),
      estimatedTotalCost: row.estimatedTotalCost,
      currency: row.currency,
      review: latestReview.get(row.id) ?? null,
    };
  });
}

export interface AdminUserRow {
  userId: string;
  tripCount: number;
  lastCreatedAt: string;
  topDestination: string;
}

/**
 * 소유자(쿠키 ownerId)별 이용 요약 (Pipeline A — /plan 일정 생성 기준). 로그인이 없어졌으므로
 * 이제 로그인 여부와 무관하게 모든 방문자가 대상이다. 이름/이메일 등 PII는 없고 쿠키 id만
 * 노출한다. topDestination은 Postgres mode() within group으로 가장 자주 만든 목적지를 뽑는다.
 */
export async function getAdminUserRows(limit = 100): Promise<AdminUserRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      userId: itineraries.userId,
      tripCount: sql<number>`count(*)`,
      lastCreatedAt: sql<string>`max(${itineraries.createdAt})`,
      topDestination: sql<string>`mode() within group (order by ${itineraries.destinationName})`,
    })
    .from(itineraries)
    .where(sql`${itineraries.userId} is not null`)
    .groupBy(itineraries.userId)
    .orderBy(desc(sql`max(${itineraries.createdAt})`))
    .limit(limit);

  return rows.map((row) => ({
    userId: row.userId ?? "unknown",
    tripCount: Number(row.tripCount),
    lastCreatedAt: new Date(row.lastCreatedAt).toISOString(),
    topDestination: row.topDestination,
  }));
}

export interface OwnerRetentionStats {
  totalOwners: number;
  repeatOwners: number;
  /** 0~1. 소유자가 없으면(초기 상태) 0. */
  repeatRatio: number;
}

/**
 * 로그인이 없어져 모든 방문자가 소유자 쿠키(ownerId)를 갖게 된 뒤, "한 번 쓰고 끝" vs
 * "다시 와서 또 만든" 비율을 본다 — getAdminUserRows()의 limit 샘플이 아니라 전체 소유자
 * 기준이라야 정확하므로 별도 쿼리로 둔다.
 */
export async function getOwnerRetentionStats(): Promise<OwnerRetentionStats> {
  const db = getDb();
  const rows = await db
    .select({ tripCount: sql<number>`count(*)` })
    .from(itineraries)
    .where(sql`${itineraries.userId} is not null`)
    .groupBy(itineraries.userId);

  const totalOwners = rows.length;
  const repeatOwners = rows.filter((row) => Number(row.tripCount) > 1).length;

  return {
    totalOwners,
    repeatOwners,
    repeatRatio: totalOwners > 0 ? repeatOwners / totalOwners : 0,
  };
}
