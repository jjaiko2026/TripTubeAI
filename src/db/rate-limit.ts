import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apiRateLimits } from "@/db/schema";

// PRD §12. YouTube search.list는 유닛 비용이 커서 하루 호출량에 상한을 둡니다.
// 실제 Google Cloud 프로젝트 쿼터에 맞춰 환경변수로 조정하세요.
const YOUTUBE_DAILY_SEARCH_LIMIT = Number(process.env.YOUTUBE_DAILY_SEARCH_LIMIT ?? 200);

function todayId(api: string): string {
  return `${api}::${new Date().toISOString().slice(0, 10)}`;
}

/**
 * 호출 전에 먼저 카운터를 올리고, 그 결과가 하루 상한 이하인지로 이번 호출이 예산 안에
 * 드는지 판단합니다. Postgres의 원자적 증가(sql)를 쓰므로 동시 요청에도 카운트가 안전합니다.
 */
async function consumeDailyQuota(api: string, dailyLimit: number): Promise<boolean> {
  const db = getDb();
  const id = todayId(api);
  const [row] = await db
    .insert(apiRateLimits)
    .values({ id, count: 1 })
    .onConflictDoUpdate({ target: apiRateLimits.id, set: { count: sql`${apiRateLimits.count} + 1` } })
    .returning({ count: apiRateLimits.count });
  return row.count <= dailyLimit;
}

/** 이번 YouTube search.list 호출이 오늘 상한 안에 드는지 확인합니다 (초과분은 캐시/목업으로 대체). */
export function consumeYoutubeQuota(): Promise<boolean> {
  return consumeDailyQuota("youtube", YOUTUBE_DAILY_SEARCH_LIMIT);
}
