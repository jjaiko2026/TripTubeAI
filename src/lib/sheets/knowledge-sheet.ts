/**
 * ATKB Phase 6-1 — video_knowledge ↔ Google Sheets(KNOWLEDGE_REVIEW) 검수 흐름.
 * 기존 content-sheet.ts(CONTENT_MASTER)와 정확히 같은 패턴: export는 DB→Sheet 전체 덮어쓰기,
 * import는 Sheet의 검수 입력 열들만 읽어 DB에 반영한다. PostgreSQL이 원본이고 Sheets는
 * 검수 인터페이스일 뿐이므로, AI 추출값(content/summary/sourceReference/confidence 등)은
 * Sheet에서 DB로 되돌려 쓰지 않는다.
 *
 * PHASE 10-0 Knowledge Review Contract(Q1-Q8) — export/import를 Q1~Q8 전체로 확장한다.
 * id/video_id/knowledge_type/summary/source_reference/confidence/place_id는 참고용 컨텍스트로만
 * 내보내고, Q1~Q6(evidence_confirmed/content_accuracy/region_relevance/place_identifiable/
 * service_value/recommendation_safety) + Q7(admin_status) + Q8(review_note)만 되돌려 쓴다.
 * reviewer/reviewed_at은 시트에 입력받지 않는다 — 손으로 적은 이름/시각을 신뢰하는 대신,
 * import를 실행한 관리자(Clerk 인증된 userId)와 실행 시각을 서버가 직접 기록한다.
 *
 * PHASE 11-2 — "콘텐츠 검수 완료(confirmed)"와 "Place Resolution(place_id 매칭)"을 독립 단계로
 * 분리한다. confirmed는 Q1/Q2/Q3/Q5/Q6 통과 + reviewer/reviewed_at만 있으면 knowledgeType과
 * 무관하게 가능하다. place_id 유무는 더 이상 confirmed를 막지 않고, PLACE_REQUIRED_KNOWLEDGE_TYPES는
 * Place Resolution이 아직 필요한 행 규모를 세는 통계용으로만 쓰인다.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { videoKnowledge } from "@/db/schema";
import type { KnowledgeContent } from "@/lib/knowledge/types";
import { overwriteSheet, readSheet, setDropdownColumn } from "@/lib/sheets/client";

const KNOWLEDGE_SHEET_NAME = "KNOWLEDGE_REVIEW";
const HEADER = [
  "id",
  "video_id",
  "knowledge_type",
  "summary",
  "source_reference",
  "confidence",
  "place_id",
  "evidence_confirmed",
  "content_accuracy",
  "region_relevance",
  "place_identifiable",
  "service_value",
  "recommendation_safety",
  "review_note",
  "admin_status",
] as const;
const COL = Object.fromEntries(HEADER.map((name, i) => [name, i])) as Record<(typeof HEADER)[number], number>;
// content-sheet.ts의 MAX_EXPORT_QUERIES(1000)와 동일한 안전 상한 취지 — 현재 582건이라 여유 있음.
const MAX_EXPORT_ROWS = 1000;

// Q1/Q3(근거확인/지역적합성) 공통 값 집합. 계약 원문의 표기(Yes/Partial/No)를 시트 표시값으로 그대로 쓴다.
const YES_PARTIAL_NO: [string, string, string] = ["Yes", "Partial", "No"];
const YES_PARTIAL_NO_CODE: Record<string, string> = { Yes: "yes", Partial: "partial", No: "no" };
const YES_PARTIAL_NO_LABEL: Record<string, string> = { yes: "Yes", partial: "Partial", no: "No" };

interface ReviewField {
  column: (typeof HEADER)[number];
  dbColumn: "evidenceConfirmed" | "contentAccuracy" | "regionRelevance" | "placeIdentifiable" | "serviceValue" | "recommendationSafety";
  labels: [string, string, string];
  labelToCode: Record<string, string>;
  codeToLabel: Record<string, string>;
}

// PHASE 10-0 계약 Q1/Q2/Q3/Q4/Q5/Q6 — 순서와 값 집합은 계약 원문 그대로.
const REVIEW_FIELDS: ReviewField[] = [
  { column: "evidence_confirmed", dbColumn: "evidenceConfirmed", labels: YES_PARTIAL_NO, labelToCode: YES_PARTIAL_NO_CODE, codeToLabel: YES_PARTIAL_NO_LABEL },
  {
    column: "content_accuracy",
    dbColumn: "contentAccuracy",
    labels: ["Yes", "수정 필요", "No"],
    labelToCode: { Yes: "yes", "수정 필요": "needs_fix", No: "no" },
    codeToLabel: { yes: "Yes", needs_fix: "수정 필요", no: "No" },
  },
  { column: "region_relevance", dbColumn: "regionRelevance", labels: YES_PARTIAL_NO, labelToCode: YES_PARTIAL_NO_CODE, codeToLabel: YES_PARTIAL_NO_LABEL },
  {
    column: "place_identifiable",
    dbColumn: "placeIdentifiable",
    labels: ["Yes", "Candidate", "No"],
    labelToCode: { Yes: "yes", Candidate: "candidate", No: "no" },
    codeToLabel: { yes: "Yes", candidate: "Candidate", no: "No" },
  },
  {
    column: "service_value",
    dbColumn: "serviceValue",
    labels: ["Yes", "Low", "No"],
    labelToCode: { Yes: "yes", Low: "low", No: "no" },
    codeToLabel: { yes: "Yes", low: "Low", no: "No" },
  },
  {
    column: "recommendation_safety",
    dbColumn: "recommendationSafety",
    labels: ["Safe", "Caution", "Unsafe"],
    labelToCode: { Safe: "safe", Caution: "caution", Unsafe: "unsafe" },
    codeToLabel: { safe: "Safe", caution: "Caution", unsafe: "Unsafe" },
  },
];

// Q7 최종 판정 — 계약 원문이 이미 코드 자체를 옵션으로 제시하므로(`confirmed`/`review`/`rejected`)
// 라벨 번역 없이 그대로 쓴다. 빈칸은 "아직 미검수"(unverified)이며 옵션 목록에 넣지 않는다.
const STATUS_OPTIONS = ["confirmed", "review", "rejected"] as const;
const VALID_STATUS = new Set<string>(STATUS_OPTIONS);

// PHASE 11-2 — confirmed의 필수조건이 아니라, Place Resolution(place_id 매칭)이 아직 필요한
// knowledge_type을 표시하는 통계용 집합이다. 단일 장소를 가리키지 않는 course/transport/info는
// 제외한다. (과거 PHASE 10-0에서는 이 집합을 confirmed 차단 조건으로 썼으나, 콘텐츠 검수와
// Place Resolution을 분리하면서 confirmed 여부와는 무관해졌다.)
const PLACE_REQUIRED_KNOWLEDGE_TYPES = new Set(["place", "food", "accommodation", "shopping", "experience"]);

/** video_knowledge 전체를 KNOWLEDGE_REVIEW 시트로 내보낸다(기존 시트 내용은 덮어씀). */
export async function exportKnowledgeToSheet(): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(videoKnowledge).limit(MAX_EXPORT_ROWS);

  const dataRows = rows.map((row) => {
    const content = row.content as KnowledgeContent;
    const line: string[] = new Array(HEADER.length).fill("");
    line[COL.id] = row.id;
    line[COL.video_id] = row.videoId ?? "";
    line[COL.knowledge_type] = row.knowledgeType;
    line[COL.summary] = content?.summary ?? "";
    line[COL.source_reference] = row.sourceReference ?? "";
    line[COL.confidence] = row.confidence ?? "";
    line[COL.place_id] = row.placeId ?? "";
    for (const field of REVIEW_FIELDS) {
      const code = row[field.dbColumn];
      line[COL[field.column]] = code ? (field.codeToLabel[code] ?? code) : "";
    }
    line[COL.review_note] = row.reviewNote ?? "";
    line[COL.admin_status] = VALID_STATUS.has(row.status) ? row.status : "";
    return line;
  });

  await overwriteSheet(KNOWLEDGE_SHEET_NAME, [[...HEADER], ...dataRows]);
  for (const field of REVIEW_FIELDS) {
    await setDropdownColumn(KNOWLEDGE_SHEET_NAME, COL[field.column], field.labels, dataRows.length);
  }
  await setDropdownColumn(KNOWLEDGE_SHEET_NAME, COL.admin_status, [...STATUS_OPTIONS], dataRows.length);
  return dataRows.length;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ImportKnowledgeReviewResult {
  total: number;
  updated: number;
  skipped: number;
  duplicate: number;
  invalidId: number;
  notFound: number;
  invalidValue: number; // Q1~Q7 중 정의된 값 집합에 없는 값이 입력됨
  confirmedWithoutPlaceId: number; // 정보용 통계(차단 아님) — 장소 식별이 필요한 타입인데 place_id 없이 confirmed로 반영된 행 수, Place Resolution 대상 규모 파악용
  checkViolation: number; // 사전 검증을 통과했는데도 DB CHECK 제약에 걸림(안전망)
}

/**
 * KNOWLEDGE_REVIEW 시트의 Q1~Q8 입력 열을 읽어 video_knowledge에 반영한다.
 * content/summary/sourceReference/confidence/knowledgeType/videoId/placeId(원본 컬럼들)는
 * 절대 건드리지 않는다. 신규 INSERT는 하지 않는다 — 존재하는 행만 id 기준으로 UPDATE한다.
 *
 * reviewerId: import를 실행하는 관리자의 식별자(Clerk userId). 시트에서 읽지 않고 호출자가
 * 넘긴다 — 손으로 적은 이름을 신뢰하지 않기 위해서다. 이 행에 대해 하나라도 검수 입력(Q1~Q8 중
 * 하나라도 비어있지 않음)이 있으면 reviewer/reviewed_at을 이 값과 현재 시각으로 채운다.
 *
 * 안전 규칙:
 * - 빈 id, 또는 Q1~Q8 전부 빈칸 → skip (변경 없음이 정상 동작)
 * - 시트 안에서 같은 id가 2번 이상 나오면 duplicate 처리하고 건너뛴다.
 * - uuid 형식이 아닌 id → invalidId
 * - DB에 존재하지 않는 id → notFound
 * - Q1~Q7 중 정의된 값 집합에 없는 값(빈칸 제외) → invalidValue
 * - admin_status='confirmed'인데 장소 식별이 필요한 타입(place/food/accommodation/shopping/
 *   experience)이면서 place_id가 비어 있어도 confirmed로 반영한다(PHASE 11-2 — 콘텐츠 검수와
 *   Place Resolution은 독립 단계). 이때 confirmedWithoutPlaceId만 증가시키고 UPDATE는 그대로 진행한다.
 * - 각 행은 독립적으로 처리한다 — 한 행의 예외가 나머지 행 처리를 막지 않는다.
 *
 * dryRun=true면 실제 UPDATE 없이 결과만 미리 계산한다.
 */
export async function importKnowledgeStatusFromSheet(
  reviewerId: string,
  options: { dryRun?: boolean } = {}
): Promise<ImportKnowledgeReviewResult> {
  const dryRun = options.dryRun ?? false;
  const result: ImportKnowledgeReviewResult = {
    total: 0,
    updated: 0,
    skipped: 0,
    duplicate: 0,
    invalidId: 0,
    notFound: 0,
    invalidValue: 0,
    confirmedWithoutPlaceId: 0,
    checkViolation: 0,
  };

  const rows = await readSheet(KNOWLEDGE_SHEET_NAME);
  if (rows.length === 0) return result;

  const header = rows[0];
  const colIndex: Partial<Record<(typeof HEADER)[number], number>> = {};
  for (const name of HEADER) {
    const idx = header.indexOf(name);
    if (idx !== -1) colIndex[name] = idx;
  }
  if (colIndex.id === undefined) return result;

  const dataRows = rows.slice(1);
  result.total = dataRows.length;

  // 1차 패스: id별 등장 횟수를 먼저 센다 — 중복 id는 첫/마지막 값을 임의로 채택하지 않고
  // 통째로 건너뛰기 위해서다.
  const idOccurrences = new Map<string, number>();
  for (const row of dataRows) {
    const id = row[colIndex.id]?.trim() ?? "";
    if (!id) continue;
    idOccurrences.set(id, (idOccurrences.get(id) ?? 0) + 1);
  }
  const duplicateIds = new Set([...idOccurrences.entries()].filter(([, count]) => count > 1).map(([id]) => id));

  const db = getDb();
  const candidateIds = [...idOccurrences.keys()].filter((id) => UUID_RE.test(id) && !duplicateIds.has(id));
  const existing =
    candidateIds.length === 0
      ? []
      : await db
          .select({ id: videoKnowledge.id, knowledgeType: videoKnowledge.knowledgeType, placeId: videoKnowledge.placeId })
          .from(videoKnowledge)
          .where(inArray(videoKnowledge.id, candidateIds));
  const existingById = new Map(existing.map((row) => [row.id, row]));

  const cell = (row: string[], col: (typeof HEADER)[number]): string => {
    const idx = colIndex[col];
    return idx === undefined ? "" : (row[idx]?.trim() ?? "");
  };

  for (const row of dataRows) {
    const id = cell(row, "id");
    if (!id) {
      result.skipped++;
      continue;
    }
    if (duplicateIds.has(id)) {
      result.duplicate++;
      continue;
    }
    if (!UUID_RE.test(id)) {
      result.invalidId++;
      continue;
    }

    const reviewNoteRaw = cell(row, "review_note");
    const statusRaw = cell(row, "admin_status");

    const update: Partial<typeof videoKnowledge.$inferInsert> = {};
    let invalid = false;
    for (const field of REVIEW_FIELDS) {
      const label = cell(row, field.column);
      if (!label) continue;
      const code = field.labelToCode[label];
      if (!code) {
        invalid = true;
        continue;
      }
      update[field.dbColumn] = code;
    }
    if (statusRaw) {
      if (!VALID_STATUS.has(statusRaw)) invalid = true;
      else update.status = statusRaw;
    }
    if (reviewNoteRaw) update.reviewNote = reviewNoteRaw;

    if (invalid) {
      result.invalidValue++;
      continue;
    }

    const hasReviewInput = Object.keys(update).length > 0;
    if (!hasReviewInput) {
      result.skipped++;
      continue;
    }

    const existingRow = existingById.get(id);
    if (!existingRow) {
      result.notFound++;
      continue;
    }

    if (
      update.status === "confirmed" &&
      PLACE_REQUIRED_KNOWLEDGE_TYPES.has(existingRow.knowledgeType) &&
      !existingRow.placeId
    ) {
      // PHASE 11-2: 더 이상 confirmed를 막지 않는다 — Place Resolution 대상 규모를 보여주는
      // 통계로만 집계하고 아래에서 정상적으로 UPDATE를 진행한다.
      result.confirmedWithoutPlaceId++;
    }

    update.reviewer = reviewerId;
    update.reviewedAt = new Date();

    try {
      if (dryRun) {
        result.updated++;
      } else {
        const updatedRows = await db
          .update(videoKnowledge)
          .set(update)
          .where(eq(videoKnowledge.id, id))
          .returning({ id: videoKnowledge.id });
        if (updatedRows.length === 0) result.notFound++;
        else result.updated++;
      }
    } catch (error) {
      // CHECK 제약 위반 등 — 위 사전 검증을 모두 통과했는데도 DB가 거부한 경우의 안전망.
      result.checkViolation++;
      console.error(`video_knowledge 검수 반영 실패 (id=${id}):`, error);
    }
  }

  return result;
}
