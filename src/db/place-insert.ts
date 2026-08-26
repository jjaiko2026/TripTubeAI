import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { places, regions, videoKnowledge } from "@/db/schema";

/**
 * neon-http 드라이버는 db.transaction()을 지원하지 않는다(node_modules/drizzle-orm/neon-http/
 * session.js: "No transactions support in neon-http driver"). 대신 db.batch()는 지원되며,
 * Neon의 sql.transaction() 배치 API를 통해 여러 쿼리를 단일 HTTP 요청으로 원자적(all-or-nothing)
 * 으로 실행한다. batch는 쿼리들을 미리 다 만들어둬야 하므로("결과를 보고 다음 쿼리를 만드는" 것이
 * 안 됨), places.id를 DB default(defaultRandom())에 맡기지 않고 여기서 미리 생성해 INSERT/UPDATE
 * 양쪽에 같은 값을 넣는다 — "생성된 id를 다시 조회해서 UPDATE" 단계 자체가 필요 없어진다.
 */

export interface PlaceInsertPayload {
  id: string; // 미리 생성한 UUID — DB default를 쓰지 않고 INSERT/UPDATE 양쪽에서 동일 값 사용
  regionId: string;
  name: string;
  normalizedName: string;
  category: string;
  address: string | null;
  lat: string | null;
  lng: string | null;
  firstSeenVideoId: string | null;
}

function normalizeName(name: string): string {
  // 코드베이스 내 유일한 실사용 정규화 관례(scripts/test-phase3d-tourapi-places.ts)를 그대로 재사용.
  return name.trim().replace(/\s+/g, "");
}

/** candidate 데이터 + 조회해둔 regionId로 INSERT payload를 만든다. DB에 쓰지 않는다(순수 함수). */
export function buildPlaceInsertPayload(candidate: {
  name: string;
  regionId: string;
  category: string;
  address: string | null;
  lat: string | null;
  lng: string | null;
  firstSeenVideoId: string | null;
}): PlaceInsertPayload {
  return {
    id: randomUUID(),
    regionId: candidate.regionId,
    name: candidate.name,
    normalizedName: normalizeName(candidate.name),
    category: candidate.category,
    address: candidate.address,
    lat: candidate.lat,
    lng: candidate.lng,
    firstSeenVideoId: candidate.firstSeenVideoId,
  };
}

export type LinkResult =
  | { status: "CREATED"; placeId: string }
  | { status: "SKIPPED_ALREADY_LINKED"; placeId: string }
  | { status: "BLOCKED_KNOWLEDGE_NOT_FOUND" }
  | { status: "BLOCKED_ALREADY_LINKED_TO_DIFFERENT_PLACE"; existingPlaceId: string };

/**
 * places INSERT + video_knowledge.place_id UPDATE를 db.batch()로 원자적으로 실행한다.
 * 두 다짐성(idempotency) 규칙을 지킨다:
 *  - video_knowledge.place_id가 이미 채워져 있으면(이 함수로든 다른 경로로든) 재실행 시 SKIP한다
 *    (중복 Place 생성 방지 — 재실행해도 안전).
 *  - UPDATE의 WHERE 절은 반드시 video_knowledge의 PK(id)만 사용한다(name/address 등 비고유
 *    필드로 갱신하지 않는다는 STEP6 원칙).
 * ⚠️ 이 함수는 실제로 호출되면 DB에 쓴다 — PHASE 12-16에서는 정의만 하고 호출하지 않는다.
 */
export async function createPlaceWithKnowledgeLink(
  knowledgeId: string,
  payload: PlaceInsertPayload
): Promise<LinkResult> {
  const db = getDb();

  const existing = await db
    .select({ placeId: videoKnowledge.placeId })
    .from(videoKnowledge)
    .where(eq(videoKnowledge.id, knowledgeId));
  if (existing.length === 0) return { status: "BLOCKED_KNOWLEDGE_NOT_FOUND" };
  if (existing[0].placeId) {
    if (existing[0].placeId === payload.id) return { status: "SKIPPED_ALREADY_LINKED", placeId: payload.id };
    return { status: "BLOCKED_ALREADY_LINKED_TO_DIFFERENT_PLACE", existingPlaceId: existing[0].placeId };
  }

  const insertQuery = db.insert(places).values(payload);
  const updateQuery = db
    .update(videoKnowledge)
    .set({ placeId: payload.id })
    .where(and(eq(videoKnowledge.id, knowledgeId), isNull(videoKnowledge.placeId)));

  // db.batch — 두 쿼리가 하나의 HTTP round-trip에서 원자적으로 실행된다(둘 다 성공 또는 둘 다 실패).
  await db.batch([insertQuery, updateQuery]);
  return { status: "CREATED", placeId: payload.id };
}

/** regionCode(예: "KR-JEJU-JEJUSI")로 regions.id(UUID)를 조회한다. READ-ONLY. */
export async function resolveRegionId(regionCode: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select({ id: regions.id }).from(regions).where(eq(regions.code, regionCode));
  return rows[0]?.id ?? null;
}
