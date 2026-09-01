import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sourceCache } from "@/db/schema";
import type { Source } from "@/lib/types";

// 유튜브 API 이용약관: 검색 API로 받은 원본 데이터는 30일 이내 갱신하거나 삭제해야 합니다.
// 이 캐시도 같은 기준(30일)을 넘기면 만료된 것으로 보고 다시 조회합니다.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 캐시 키 정규화(L1). 같은 장소를 가리키는 검색어가 유니코드 조합형 차이(NFC/NFD), 공백
 * 개수·앞뒤 공백, 영문 대소문자만 다를 때 같은 캐시 행에 맞도록 표준화합니다. 표기 자체를
 * 바꾸는 정규화(구두점 제거·유사어 병합 등)는 하지 않습니다 — 서로 다른 장소를 한 행으로
 * 합쳐 잘못된 참고자료가 붙을 위험이 있어서입니다.
 *
 * source_cache.query는 항상 이 함수를 통과한 값으로만 저장/조회됩니다. 스키마 변경은
 * 없으며, 정규화 이전에 저장된 기존 행은 30일 TTL이 지나면 자연히 정규화된 키로 다시
 * 채워집니다.
 */
export function normalizeQuery(query: string): string {
  return query.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** query(검색어)에 대해 아직 유효한(30일 이내) 캐시된 소스 후보가 있으면 반환합니다. */
export async function getCachedSources(query: string): Promise<Source[] | null> {
  const db = getDb();
  const key = normalizeQuery(query);
  const [row] = await db.select().from(sourceCache).where(eq(sourceCache.query, key)).limit(1);
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > CACHE_TTL_MS) return null;
  return row.sources as Source[];
}

/** 실제 API에서 받아온(또는 AI로 랭킹한) 소스 후보를 query 기준으로 캐시에 저장합니다. */
export async function saveCachedSources(query: string, sources: Source[]): Promise<void> {
  const db = getDb();
  const key = normalizeQuery(query);
  await db
    .insert(sourceCache)
    .values({ query: key, sources, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: sourceCache.query, set: { sources, fetchedAt: new Date() } });
}
