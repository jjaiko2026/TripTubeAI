import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { itineraryPlanCache } from "@/db/schema";

// 실패 분기에서만 읽는 캐시라 신선도가 크게 중요하지 않다(어떤 실제 plan이든 결정론적 폴백보다
// 낫다). 그래도 목적지 정보가 오래 굳는 걸 막으려 소스 캐시와 같은 30일 TTL을 둔다.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** requestSeedKey + mustIncludePlaceIds로 만든 문자열 키에 대해 아직 유효한 캐시된 일정 뼈대를 반환합니다. */
export async function getCachedPlan<T>(key: string): Promise<T | null> {
  const db = getDb();
  const [row] = await db.select().from(itineraryPlanCache).where(eq(itineraryPlanCache.key, key)).limit(1);
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > CACHE_TTL_MS) return null;
  return row.plan as T;
}

/** AI가 성공적으로 만든 일정 뼈대를 key 기준으로 캐시에 저장(upsert)합니다. */
export async function saveCachedPlan(key: string, plan: unknown): Promise<void> {
  const db = getDb();
  await db
    .insert(itineraryPlanCache)
    .values({ key, plan, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: itineraryPlanCache.key, set: { plan, fetchedAt: new Date() } });
}
