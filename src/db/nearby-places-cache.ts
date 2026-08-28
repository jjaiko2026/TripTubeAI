import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { nearbyPlacesCache } from "@/db/schema";
import type { NearbyPlacesResult } from "@/lib/types";

// trip_tips_cache와 같은 7일 TTL. 유명 장소 목록은 자주 바뀌지 않아 이 정도면 최신성과
// AI 호출 비용의 절충으로 충분합니다.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function nearbyPlacesCacheKey(destinationName: string, region: string, purposesKey: string): string {
  return [destinationName, region, purposesKey].join("::");
}

export async function getCachedNearbyPlaces(key: string): Promise<NearbyPlacesResult | null> {
  const db = getDb();
  const [row] = await db.select().from(nearbyPlacesCache).where(eq(nearbyPlacesCache.key, key)).limit(1);
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > CACHE_TTL_MS) return null;
  return row.result as NearbyPlacesResult;
}

export async function saveCachedNearbyPlaces(key: string, result: NearbyPlacesResult): Promise<void> {
  const db = getDb();
  await db
    .insert(nearbyPlacesCache)
    .values({ key, result, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: nearbyPlacesCache.key, set: { result, fetchedAt: new Date() } });
}
