import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { searchLocks } from "@/db/schema";

/**
 * cacheKey(검색어) 하나당 동시에 한 요청만 실검색하도록 락을 겁니다 (PRD §10 Request
 * Deduplication). 락을 못 얻으면 false를 반환하니, 호출부는 캐시가 채워지길 잠깐 기다렸다가
 * 그래도 안 채워지면 락 없이 직접 진행하면 됩니다(무한 대기 방지).
 */
export async function tryAcquireSearchLock(cacheKey: string, ttlMs: number): Promise<boolean> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + ttlMs);

  try {
    await db.insert(searchLocks).values({ cacheKey, expiresAt });
    return true;
  } catch {
    // 기본키 충돌 = 이미 다른 요청이 락을 쥐고 있음. 그 락이 만료됐으면(보유자가 비정상
    // 종료된 경우) 조건부 업데이트로 락을 넘겨받습니다.
    const stolen = await db
      .update(searchLocks)
      .set({ lockedAt: new Date(), expiresAt })
      .where(and(eq(searchLocks.cacheKey, cacheKey), lt(searchLocks.expiresAt, new Date())))
      .returning({ cacheKey: searchLocks.cacheKey });
    return stolen.length > 0;
  }
}

export async function releaseSearchLock(cacheKey: string): Promise<void> {
  const db = getDb();
  await db.delete(searchLocks).where(eq(searchLocks.cacheKey, cacheKey));
}
