import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentModeration } from "@/db/schema";

export type ModerationStatus = "approved" | "rejected";

/** 소스 랭킹/노출 단계에서 걸러낼, 관리자가 거부 처리한 sourceId 전체를 가져옵니다. */
export async function getRejectedSourceIds(): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ sourceId: contentModeration.sourceId })
    .from(contentModeration)
    .where(eq(contentModeration.status, "rejected"));
  return new Set(rows.map((r) => r.sourceId));
}

/** 관리자가 시트에서 표시한 승인/거부를 반영합니다. */
export async function upsertModeration(sourceId: string, status: ModerationStatus): Promise<void> {
  const db = getDb();
  await db
    .insert(contentModeration)
    .values({ sourceId, status, updatedAt: new Date() })
    .onConflictDoUpdate({ target: contentModeration.sourceId, set: { status, updatedAt: new Date() } });
}

/** CONTENT_MASTER 시트를 채울 때, 현재 판정 상태를 sourceId 기준으로 한 번에 조회합니다. */
export async function getAllModerationStatuses(): Promise<Map<string, ModerationStatus>> {
  const db = getDb();
  const rows = await db.select().from(contentModeration);
  return new Map(rows.map((r) => [r.sourceId, r.status as ModerationStatus]));
}
