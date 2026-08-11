import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { itineraries, reviews } from "@/db/schema";
import type { Itinerary, ItineraryDay, Purpose, Review } from "@/lib/types";

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
      days: itinerary.days,
      estimatedTotalCost: itinerary.estimatedTotalCost,
      currency: itinerary.currency,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getItinerary(id: string): Promise<Itinerary | null> {
  if (!UUID_RE.test(id)) return null;

  const db = getDb();
  const [row] = await db.select().from(itineraries).where(eq(itineraries.id, id)).limit(1);
  if (!row) return null;

  return {
    request: {
      destination: row.destination,
      memberType: row.memberType as Itinerary["request"]["memberType"],
      memberCount: row.memberCount,
      nights: row.nights,
      month: row.month,
      purposes: row.purposes as Purpose[],
    },
    destinationName: row.destinationName,
    region: row.region as Itinerary["region"],
    days: row.days as ItineraryDay[],
    estimatedTotalCost: row.estimatedTotalCost,
    currency: row.currency as Itinerary["currency"],
    generatedAt: row.createdAt.toISOString(),
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
  const purposeCounts = new Map<string, number>();

  for (const row of rows) {
    const dayKey = row.createdAt.toISOString().slice(0, 10);
    if (byDay.has(dayKey)) byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);

    destinationCounts.set(row.destinationName, (destinationCounts.get(row.destinationName) ?? 0) + 1);

    for (const purpose of row.purposes as string[]) {
      purposeCounts.set(purpose, (purposeCounts.get(purpose) ?? 0) + 1);
    }
  }

  return {
    totalItineraries: rows.length,
    dailyGenerated: Array.from(byDay.entries()).map(([date, count]) => ({ date, count })),
    topDestinations: Array.from(destinationCounts.entries())
      .map(([destination, count]) => ({ destination, count }))
      .sort((a, b) => b.count - a.count),
    purposeDistribution: Array.from(purposeCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  };
}
