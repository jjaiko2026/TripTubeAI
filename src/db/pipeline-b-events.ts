import { and, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { pipelineBEvents } from "@/db/schema";

export type PipelineBEventType =
  | "recommend_executed"
  | "place_selected"
  | "plan_generate_requested"
  | "itinerary_completed"
  | "place_detail_viewed";

/**
 * PHASE 13-2 E2E 검증(Clerk Backend API로 만든 실제 테스트 계정)이 남긴 데이터를 실사용
 * 집계에서 제외하기 위한 목록. 검증 데이터 자체는 삭제하지 않고 보존한다(PHASE 13-3 결정) —
 * 집계 쿼리에서만 걸러낸다. 익명(userId null) 이벤트는 이 목록으로 걸러낼 수 없다(같은
 * 테스트 세션 중 로그인 전 상태로 남긴 것들이 섞여 있을 수 있음, 계정 식별이 안 되기
 * 때문 — PHASE 13-2 보고서 참고). 새 테스트 계정이 생기면 이 배열에 추가한다.
 */
export const PIPELINE_B_TEST_USER_IDS: readonly string[] = ["user_3IFze9Q0GVZZswzIxlRF83tX9K9"];

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

export interface PipelineBUsageStats {
  recommendExecuted: number;
  placeDetailViewed: number;
  placeSelected: number;
  planGenerateRequested: number;
  itineraryCompleted: number;
  /** 이벤트에 userId가 남은(로그인 상태에서 발생한) 행 기준 고유 사용자 수. */
  distinctUsers: number;
  /** regionCode가 있는 이벤트(recommend_executed/plan_generate_requested/itinerary_completed)만
   *  지역별로 묶은 결과. place_selected/place_detail_viewed는 regionCode를 남기지 않아 제외. */
  byRegion: { regionCode: string; eventType: PipelineBEventType; count: number }[];
}

/**
 * PHASE 13-3 — pipeline_b_events를 직접 집계한다(별도 analytics 플랫폼 없음, mock 데이터
 * 없음). PIPELINE_B_TEST_USER_IDS에 있는 계정의 행은 항상 제외한다 — 단 userId가 null인
 * 익명 이벤트는 그대로 포함한다(NOT IN의 NULL 비교 함정을 피하려 OR isNull로 명시).
 */
export async function getPipelineBUsageStats(): Promise<PipelineBUsageStats> {
  const db = getDb();
  const excludeTestUser =
    PIPELINE_B_TEST_USER_IDS.length > 0
      ? or(isNull(pipelineBEvents.userId), notInArray(pipelineBEvents.userId, [...PIPELINE_B_TEST_USER_IDS]))
      : undefined;

  const byTypeRows = await db
    .select({ eventType: pipelineBEvents.eventType, count: sql<number>`count(*)` })
    .from(pipelineBEvents)
    .where(excludeTestUser)
    .groupBy(pipelineBEvents.eventType);
  const countByType = new Map(byTypeRows.map((r) => [r.eventType, Number(r.count)]));

  const byRegionRows = await db
    .select({
      regionCode: pipelineBEvents.regionCode,
      eventType: pipelineBEvents.eventType,
      count: sql<number>`count(*)`,
    })
    .from(pipelineBEvents)
    .where(and(excludeTestUser, isNotNull(pipelineBEvents.regionCode)))
    .groupBy(pipelineBEvents.regionCode, pipelineBEvents.eventType);

  const [{ count: distinctUsers } = { count: 0 }] = await db
    .select({ count: sql<number>`count(distinct ${pipelineBEvents.userId})` })
    .from(pipelineBEvents)
    .where(and(excludeTestUser, isNotNull(pipelineBEvents.userId)));

  return {
    recommendExecuted: countByType.get("recommend_executed") ?? 0,
    placeDetailViewed: countByType.get("place_detail_viewed") ?? 0,
    placeSelected: countByType.get("place_selected") ?? 0,
    planGenerateRequested: countByType.get("plan_generate_requested") ?? 0,
    itineraryCompleted: countByType.get("itinerary_completed") ?? 0,
    distinctUsers: Number(distinctUsers),
    byRegion: byRegionRows.map((r) => ({
      regionCode: r.regionCode as string,
      eventType: r.eventType as PipelineBEventType,
      count: Number(r.count),
    })),
  };
}
