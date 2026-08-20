/**
 * AI ITINERARY GENERATION v1 — generateItineraryFromPlaces() 검증.
 * 이 환경은 AI_GATEWAY_API_KEY가 없어 실제 AI 응답의 "성공 경로"(장소가 실제로 채워진
 * 일정)는 검증할 수 없다(L-7과 동일한 제약, 투명하게 보고). 대신 안전장치 쪽 —
 * "AI 호출/응답이 실패해도 DB에 아무 것도 남지 않는지"는 실측 가능하므로 검증한다.
 */
export {};

import { getItinerary, getRecentItinerariesForUser, deleteItinerary } from "@/db/queries";
import { generateItineraryFromPlaces } from "@/lib/place-itinerary";

const TEST_USER_ID = "test-phase3l8-verification";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  console.log("=== 존재하지 않는 regionCode(빈 후보) → AI 호출 전에 즉시 null ===");
  const emptyRegionResult = await generateItineraryFromPlaces({
    regionCode: "NOT-A-REAL-REGION",
    regionLabel: "없는지역",
    days: 3,
    purposes: [],
    notes: "",
    memberType: "혼자",
    memberCount: 1,
    month: 6,
    userId: TEST_USER_ID,
  });
  check("빈 후보 → null(AI 호출/DB 쓰기 없이 조기 반환)", emptyRegionResult === null, String(emptyRegionResult));

  const before = await getRecentItinerariesForUser(TEST_USER_ID, 50);
  check("사전 확인: 테스트 userId 소유 일정 0건", before.length === 0, String(before.length));

  console.log("\n=== 실제 지역(서귀포시)으로 생성 시도 — AI Gateway 인증 실패 예상 ===");
  const realResult = await generateItineraryFromPlaces({
    regionCode: "KR-JEJU-SEOGWIPO",
    regionLabel: "서귀포시",
    days: 3,
    purposes: ["healing", "food"],
    notes: "바다가 보이는 곳이면 좋겠어요",
    memberType: "혼자",
    memberCount: 1,
    month: 6,
    userId: TEST_USER_ID,
  });

  const after = await getRecentItinerariesForUser(TEST_USER_ID, 50);

  if (realResult === null) {
    console.log("  (환경 제약으로 AI 호출 실패 — 예상된 결과)");
    check("AI 실패 시 반환값 null", true, "");
    check("AI 실패 시 DB에 일정이 남지 않음(고아 itinerary row 없음)", after.length === 0, `실행 전 ${before.length}건, 실행 후 ${after.length}건`);
  } else {
    // 만약 이 환경에 실제로 AI_GATEWAY_API_KEY가 설정되어 있었다면 이 분기로 들어온다.
    console.log(`  실제 AI 생성 성공: itineraryId=${realResult}`);
    const itinerary = await getItinerary(realResult, TEST_USER_ID);
    check("생성된 일정을 getItinerary로 재조회 가능", itinerary !== null, "");
    const allItems = itinerary?.days.flatMap((d) => d.items) ?? [];
    check("생성된 일정에 항목이 1개 이상 있음", allItems.length > 0, String(allItems.length));
    check("모든 항목에 placeId가 있음(TourAPI 장소 참조, 임의 생성 아님)", allItems.every((i) => !!i.placeId), "");
    await deleteItinerary(realResult, TEST_USER_ID);
    console.log(`  테스트 일정 정리 완료: ${realResult}`);
  }

  console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL (총 ${passed + failed}건) ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("오류:", e?.message ?? e);
  process.exit(1);
});
