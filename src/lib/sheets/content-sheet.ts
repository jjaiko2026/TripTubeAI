import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { sourceCache } from "@/db/schema";
import type { Source } from "@/lib/types";
import { getAllModerationStatuses, upsertModeration, type ModerationStatus } from "@/db/content-moderation";
import { overwriteSheet, readSheet, setDropdownColumn } from "@/lib/sheets/client";

const CONTENT_SHEET_NAME = "CONTENT_MASTER";
const HEADER = ["query", "kind", "source_id", "title", "channel_or_site", "url", "fetched_at", "admin_status"];
const ADMIN_STATUS_COLUMN_INDEX = HEADER.indexOf("admin_status");
// Sheets 쓰기 요청 하나의 payload를 안전한 크기로 유지하기 위한 상한 (source_cache 행 기준).
const MAX_EXPORT_QUERIES = 1000;

function channelOrSite(source: Source): string {
  return source.kind === "youtube" ? source.channelName : source.siteName;
}

const STATUS_LABEL: Record<ModerationStatus, string> = { approved: "승인", rejected: "거부" };
const LABEL_TO_STATUS: Record<string, ModerationStatus> = { 승인: "approved", 거부: "rejected" };

/** source_cache를 (query, source) 단위로 펼쳐 CONTENT_MASTER 시트 전체를 덮어씁니다. */
export async function exportContentToSheet(): Promise<number> {
  const db = getDb();
  const cacheRows = await db
    .select()
    .from(sourceCache)
    .orderBy(desc(sourceCache.fetchedAt))
    .limit(MAX_EXPORT_QUERIES);
  const moderationBySourceId = await getAllModerationStatuses();

  const dataRows = cacheRows.flatMap((row) =>
    (row.sources as Source[]).map((source) => [
      row.query,
      source.kind,
      source.id,
      source.title,
      channelOrSite(source),
      source.url,
      row.fetchedAt.toISOString(),
      moderationBySourceId.has(source.id) ? STATUS_LABEL[moderationBySourceId.get(source.id)!] : "",
    ])
  );

  await overwriteSheet(CONTENT_SHEET_NAME, [HEADER, ...dataRows]);
  // 오타로 승인/거부가 무시되는 걸 막기 위해, admin_status 열에 드롭다운을 달아둡니다.
  await setDropdownColumn(CONTENT_SHEET_NAME, ADMIN_STATUS_COLUMN_INDEX, ["승인", "거부"], dataRows.length);
  return dataRows.length;
}

/** CONTENT_MASTER 시트의 admin_status 열(승인/거부)을 읽어 content_moderation에 반영합니다. */
export async function importModerationFromSheet(): Promise<{ approved: number; rejected: number }> {
  const rows = await readSheet(CONTENT_SHEET_NAME);
  if (rows.length === 0) return { approved: 0, rejected: 0 };

  const header = rows[0];
  const sourceIdIdx = header.indexOf("source_id");
  const statusIdx = header.indexOf("admin_status");
  if (sourceIdIdx === -1 || statusIdx === -1) return { approved: 0, rejected: 0 };

  const updates: { sourceId: string; status: ModerationStatus }[] = [];
  for (const row of rows.slice(1)) {
    const sourceId = row[sourceIdIdx]?.trim();
    const status = LABEL_TO_STATUS[row[statusIdx]?.trim() ?? ""];
    if (sourceId && status) updates.push({ sourceId, status });
  }

  await Promise.all(updates.map((u) => upsertModeration(u.sourceId, u.status)));

  return {
    approved: updates.filter((u) => u.status === "approved").length,
    rejected: updates.filter((u) => u.status === "rejected").length,
  };
}
