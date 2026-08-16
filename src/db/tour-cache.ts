import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tourPlaceCache } from "@/db/schema";

export interface TourPlaceHint {
  title: string;
  tags: string[];
}

// TourAPI 관광지 데이터는 유튜브/블로그(30일)보다 변경 빈도가 낮아 더 길게 캐싱합니다.
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function getCachedTourPlaces(cacheKey: string): Promise<TourPlaceHint[] | null> {
  const db = getDb();
  const [row] = await db.select().from(tourPlaceCache).where(eq(tourPlaceCache.cacheKey, cacheKey)).limit(1);
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > CACHE_TTL_MS) return null;
  return row.places;
}

export async function saveCachedTourPlaces(cacheKey: string, places: TourPlaceHint[]): Promise<void> {
  const db = getDb();
  await db
    .insert(tourPlaceCache)
    .values({ cacheKey, places, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: tourPlaceCache.cacheKey, set: { places, fetchedAt: new Date() } });
}
