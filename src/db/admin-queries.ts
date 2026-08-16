import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apiRateLimits, itineraries, reviews } from "@/db/schema";

/** 관리자 대시보드 상단 요약 지표. 방문자 트래킹이 아직 없어 가입/이용 수치는 itineraries 기준으로만 집계합니다. */
export async function getAdminSummary() {
  const db = getDb();

  const [[itineraryCount], [reviewCount], [distinctUserCount], [todayYoutubeQuota]] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(itineraries),
    db.select({ count: sql<number>`count(*)` }).from(reviews),
    db.select({ count: sql<number>`count(distinct ${itineraries.userId})` }).from(itineraries),
    db
      .select({ count: apiRateLimits.count })
      .from(apiRateLimits)
      .where(eq(apiRateLimits.id, `youtube::${new Date().toISOString().slice(0, 10)}`))
      .limit(1),
  ]);

  return {
    totalItineraries: Number(itineraryCount?.count ?? 0),
    totalReviews: Number(reviewCount?.count ?? 0),
    distinctUsers: Number(distinctUserCount?.count ?? 0),
    youtubeQuotaToday: todayYoutubeQuota?.count ?? 0,
  };
}

export interface AdminItinerarySummary {
  id: string;
  destinationName: string;
  region: string;
  memberType: string;
  memberCount: number;
  nights: number;
  month: number;
  createdAt: string;
}

export async function listItinerariesForAdmin(filters: { region?: string } = {}, limit = 50): Promise<AdminItinerarySummary[]> {
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
    .where(filters.region ? eq(itineraries.region, filters.region) : undefined)
    .orderBy(desc(itineraries.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export interface AdminUserSummary {
  userId: string;
  tripCount: number;
  lastCreatedAt: string;
  topDestination: string;
}

/** 로그인 사용자별 이용 요약. Clerk 프로필 정보는 조회하지 않고(불필요한 개인정보 노출 방지) userId만 표시합니다. */
export async function listUsersForAdmin(limit = 50): Promise<AdminUserSummary[]> {
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
