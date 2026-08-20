/**
 * AI TRAVEL RECOMMENDATION v1 — recommendPlaces() 검증.
 * 실제 AI 호출 1회를 수행해, 반환된 모든 placeId가 후보(getPlacesByRegion() 결과) 안에만
 * 있는지 확인한다 — "AI가 DB 밖 장소를 만들어내지 않는다"는 핵심 원칙의 실측 검증.
 */
export {};

import { getPlacesByRegion } from "@/db/queries";
import { recommendPlaces } from "@/lib/place-recommendation";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  console.log("=== 후보 없음(빈 배열) → AI 호출 없이 빈 결과 ===");
  const emptyResult = await recommendPlaces([], ["food"], "");
  check("빈 후보 → 빈 추천, 조기 반환(API 낭비 없음)", emptyResult.length === 0, String(emptyResult.length));

  console.log("\n=== 실제 AI 호출: 서귀포시, 힐링+음식 목적 ===");
  const candidates = await getPlacesByRegion("KR-JEJU-SEOGWIPO");
  check("후보(getPlacesByRegion) 40건 확보", candidates.length === 40, String(candidates.length));

  const candidateIds = new Set(candidates.map((c) => c.id));
  const recommendations = await recommendPlaces(candidates, ["healing", "food"], "바다가 보이는 곳이면 좋겠어요");

  check("추천 결과 1~5건", recommendations.length >= 1 && recommendations.length <= 5, String(recommendations.length));

  const allWithinCandidates = recommendations.every((r) => candidateIds.has(r.place.id));
  check("모든 추천 placeId가 후보 목록 안에만 있음(DB 밖 장소 생성 없음)", allWithinCandidates, JSON.stringify(recommendations.map((r) => r.place.id)));

  const noDuplicates = new Set(recommendations.map((r) => r.place.id)).size === recommendations.length;
  check("중복 추천 없음", noDuplicates, "");

  const allHaveReason = recommendations.every((r) => typeof r.reason === "string" && r.reason.trim().length > 0);
  check("모든 추천에 이유(reason)가 채워져 있음", allHaveReason, "");

  console.log("\n추천 결과:");
  recommendations.forEach((r) => console.log(`  - ${r.place.name}: ${r.reason}`));

  console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL (총 ${passed + failed}건) ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("오류:", e?.message ?? e);
  process.exit(1);
});
