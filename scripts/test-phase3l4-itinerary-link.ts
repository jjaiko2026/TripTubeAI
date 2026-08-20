/**
 * TOUR PLACE → ITINERARY v1 — 쓰기 경로 종단간 검증.
 * Server Action(addPlaceToItineraryAction)이 실제로 호출하는 것과 동일한 함수 체인
 * (getPlaceById → addPlaceToItinerary → getItinerary)을 그대로 실행한다.
 * 테스트 전용 userId로 생성한 일정만 다루고, 검증 후 즉시 삭제한다(기존 saveItinerary/
 * deleteItinerary/getItinerary 재사용, 실제 사용자 데이터는 전혀 건드리지 않음).
 */
export {};

import { saveItinerary, getItinerary, getPlaceById, addPlaceToItinerary, deleteItinerary } from "@/db/queries";
import type { Itinerary } from "@/lib/types";

const TEST_USER_ID = "test-phase3l4-verification";
const TEST_PLACE_ID = "21895b18-992a-42c2-aeb3-114a47bb86d5"; // 거슨새미오름 (제주시, contentTypeId=12)

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`); }
}

const testItinerary: Itinerary = {
  request: {
    destination: "테스트목적지",
    region: "국내",
    memberType: "혼자",
    memberCount: 1,
    nights: 1,
    month: 1,
    purposes: [],
    notes: "",
  },
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
    check("getPlaceById 재사용 — 거슨새미오름 조회 성공", place !== null, "");
    if (!place) throw new Error("place null, 중단");
    check("place.coordinateReliable === true", place.coordinateReliable === true, String(place.coordinateReliable));

    // 소유자 아닌 userId로는 추가 실패해야 함(보안 경계 확인)
    const wrongUserResult = await addPlaceToItinerary(itineraryId, "wrong-user-id", place, 1);
    check("다른 userId로 추가 시도 → false(소유자 아님)", wrongUserResult === false, String(wrongUserResult));

    const addResult = await addPlaceToItinerary(itineraryId, TEST_USER_ID, place, 1);
    check("정당한 소유자로 추가 → true", addResult === true, String(addResult));

    const afterAdd = await getItinerary(itineraryId, TEST_USER_ID);
    check("getItinerary로 재조회 성공", afterAdd !== null, "");
    if (!afterAdd) throw new Error("재조회 실패, 중단");

    const day1 = afterAdd.days.find((d) => d.day === 1);
    check("1일차 존재", day1 !== undefined, "");
    const addedItem = day1?.items.find((i) => i.placeId === place.id);
    check("추가된 항목이 placeId로 식별됨(TourAPI 데이터 중복 저장 아님, 참조만 저장)", addedItem !== undefined, JSON.stringify(day1?.items));
    check("항목 title === place.name", addedItem?.title === place.name, addedItem?.title);
    check(
      "항목 location이 place 좌표와 일치(신뢰 가능 좌표라 location 세팅됨)",
      addedItem?.location?.lat === Number(place.lat) && addedItem?.location?.lng === Number(place.lng),
      JSON.stringify(addedItem?.location)
    );
    check("항목 description === place.overview", addedItem?.description === (place.overview ?? ""), "");

    // 다른 일정(존재하지 않는 id)에는 추가되지 않아야 함
    const nonexistentResult = await addPlaceToItinerary("00000000-0000-0000-0000-000000000000", TEST_USER_ID, place, 1);
    check("존재하지 않는 itineraryId → false", nonexistentResult === false, String(nonexistentResult));
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
