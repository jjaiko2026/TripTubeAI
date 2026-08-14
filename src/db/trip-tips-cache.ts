import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tripTipsCache } from "@/db/schema";
import type { TripTips } from "@/lib/types";

// 환율처럼 매일 바뀌는 정보는 다루지 않고 기후/준비물/최근 이슈만 다루므로, 소스 캐시(30일)보다
// 짧은 7일 TTL로 최신성과 AI 호출 비용을 절충합니다.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function tripTipsCacheKey(destinationName: string, region: string, month: number): string {
  return [destinationName, region, month].join("::");
}

/** key(목적지+지역+월)에 대해 아직 유효한(7일 이내) 캐시된 여행 정보가 있으면 반환합니다. */
export async function getCachedTripTips(key: string): Promise<TripTips | null> {
  const db = getDb();
  const [row] = await db.select().from(tripTipsCache).where(eq(tripTipsCache.key, key)).limit(1);
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > CACHE_TTL_MS) return null;
  return row.tips as TripTips;
}

/** AI로 생성한 여행 정보를 key 기준으로 캐시에 저장합니다. */
export async function saveCachedTripTips(key: string, tips: TripTips): Promise<void> {
  const db = getDb();
  await db
    .insert(tripTipsCache)
    .values({ key, tips, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: tripTipsCache.key, set: { tips, fetchedAt: new Date() } });
}
