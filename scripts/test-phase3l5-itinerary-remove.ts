/**
 * ITINERARY PLACE MANAGEMENT v1 — removePlaceFromItinerary() 종단간 검증.
 * addPlaceToItinerary()로 추가 → removePlaceFromItinerary()로 제거 → getItinerary()로
 * 재확인. 테스트 전용 userId로 생성한 일정만 다루고 검증 후 삭제한다.
 */
export {};

import {
  saveItinerary,
  getItinerary,
  getPlaceById,
  addPlaceToItinerary,
  removePlaceFromItinerary,
  deleteItinerary,
} from "@/db/queries";
import type { Itinerary } from "@/lib/types";

const TEST_USER_ID = "test-phase3l5-verification";
const TEST_PLACE_ID = "21895b18-992a-42c2-aeb3-114a47bb86d5"; // 거슨새미오름

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`); }
}

const testItinerary: Itinerary = {
  request: { destination: "테스트목적지", region: "국내", memberType: "혼자", memberCount: 1, nights: 1, month: 1, purposes: [], notes: "" },
  destinationName: "테스트목적지",
  region: "국내",
  days: [{ day: 1, label: "1일차", items: [] }],
  estimatedTotalCost: 0,
  currency: "KRW",
  generatedAt: new Date().toISOString(),
  tripTips: { climate: "", packingList: [], recentIssues: [] },
};

async function main() {
  let itineraryId: string | null = null;
  try {
    itineraryId = await saveItinerary(testItinerary, TEST_USER_ID);
    console.log(`테스트 일정 생성: ${itineraryId}`);

    const place = await getPlaceById(TEST_PLACE_ID);
    if (!place) throw new Error("place null, 중단");

    await addPlaceToItinerary(itineraryId, TEST_USER_ID, place, 1);
    const afterAdd = await getItinerary(itineraryId, TEST_USER_ID);
    const hasItemAfterAdd = afterAdd?.days.find((d) => d.day === 1)?.items.some((i) => i.placeId === place.id);
    check("추가 직후 항목 존재", hasItemAfterAdd === true, "");

    // 소유자 아닌 userId로 삭제 시도 → false, 항목은 그대로 남아야 함
    const wrongUserRemove = await removePlaceFromItinerary(itineraryId, "wrong-user-id", 1, place.id);
    check("다른 userId로 삭제 시도 → false(소유자 아님)", wrongUserRemove === false, String(wrongUserRemove));
    const stillThere = await getItinerary(itineraryId, TEST_USER_ID);
    const itemStillThere = stillThere?.days.find((d) => d.day === 1)?.items.some((i) => i.placeId === place.id);
    check("잘못된 삭제 시도 후에도 항목이 그대로 남아있음", itemStillThere === true, "");

    // 정당한 소유자로 삭제
    const removeResult = await removePlaceFromItinerary(itineraryId, TEST_USER_ID, 1, place.id);
    check("정당한 소유자로 삭제 → true", removeResult === true, String(removeResult));

    const afterRemove = await getItinerary(itineraryId, TEST_USER_ID);
    const itemGone = afterRemove?.days.find((d) => d.day === 1)?.items.some((i) => i.placeId === place.id);
    check("삭제 후 항목이 사라짐", itemGone === false, "");
    check("삭제 후에도 1일차 자체(빈 배열)는 남아있음(day 구조 보존)", afterRemove?.days.some((d) => d.day === 1) === true, "");
  } finally {
    if (itineraryId) {
      await deleteItinerary(itineraryId, TEST_USER_ID);
      const afterDelete = await getItinerary(itineraryId, TEST_USER_ID);
      check("정리: 테스트 일정 삭제 확인(getItinerary → null)", afterDelete === null, "");
      console.log(`테스트 일정 정리 완료: ${itineraryId}`);
    }
  }

  console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL (총 ${passed + failed}건) ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("오류:", e?.message ?? e);
  process.exit(1);
});
