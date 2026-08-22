import { getDb } from "@/db";
import { pipelineBEvents } from "@/db/schema";

export type PipelineBEventType =
  | "recommend_executed"
  | "place_selected"
  | "plan_generate_requested"
  | "itinerary_completed"
  | "place_detail_viewed";

/**
 * PHASE 13-2 — Pipeline B 실사용 이벤트 1건을 기록한다. 분석 로그이므로 실패해도 실제
 * 사용자 흐름(추천 조회/일정 생성 등)을 절대 막으면 안 된다 — 항상 실패를 삼키고
 * console.error로만 남긴다 (source-cache.ts/search-lock.ts 등 기존 부가기능 write와 동일한
 * "best-effort, catch and log" 패턴).
 */
export async function logPipelineBEvent(event: {
  eventType: PipelineBEventType;
  userId?: string | null;
  regionCode?: string | null;
  placeId?: string | null;
  itineraryId?: string | null;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(pipelineBEvents).values({
      eventType: event.eventType,
      userId: event.userId ?? null,
      regionCode: event.regionCode ?? null,
      placeId: event.placeId ?? null,
      itineraryId: event.itineraryId ?? null,
    });
  } catch (error) {
    console.error(`pipeline-b event log failed (${event.eventType}):`, error);
  }
}
