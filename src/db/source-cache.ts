import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sourceCache } from "@/db/schema";
import type { Source } from "@/lib/types";

// 유튜브 API 이용약관: 검색 API로 받은 원본 데이터는 30일 이내 갱신하거나 삭제해야 합니다.
// 이 캐시도 같은 기준(30일)을 넘기면 만료된 것으로 보고 다시 조회합니다.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** query(검색어)에 대해 아직 유효한(30일 이내) 캐시된 소스 후보가 있으면 반환합니다. */
export async function getCachedSources(query: string): Promise<Source[] | null> {
  const db = getDb();
  const [row] = await db.select().from(sourceCache).where(eq(sourceCache.query, query)).limit(1);
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > CACHE_TTL_MS) return null;
  return row.sources as Source[];
}

/** 실제 API에서 받아온(또는 AI로 랭킹한) 소스 후보를 query 기준으로 캐시에 저장합니다. */
export async function saveCachedSources(query: string, sources: Source[]): Promise<void> {
  const db = getDb();
  await db
    .insert(sourceCache)
    .values({ query, sources, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: sourceCache.query, set: { sources, fetchedAt: new Date() } });
}
