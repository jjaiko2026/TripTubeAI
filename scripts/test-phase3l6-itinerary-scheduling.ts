/**
 * ITINERARY PLACE SCHEDULING v1 — addPlaceToItinerary(day) 종단간 검증.
 * 기존 1일차 하드코딩 대신 임의 day를 지정할 수 있는지, 없던 day가 자동 생성되며
 * day 순서가 항상 오름차순으로 유지되는지 확인한다. 테스트 전용 userId로 생성한
 * 일정만 다루고 검증 후 삭제한다.
 */
export {};

import {
  saveItinerary,
  getItinerary,
  getPlaceById,
  addPlaceToItinerary,
  deleteItinerary,
} from "@/db/queries";
import type { Itinerary } from "@/lib/types";

const TEST_USER_ID = "test-phase3l6-verification";
const PLACE_A = "21895b18-992a-42c2-aeb3-114a47bb86d5"; // 거슨새미오름 (contentTypeId=12)
const PLACE_B = "ec04b8a3-6d52-4087-9804-0e1623ffc68e"; // 아프리카 박물관 (contentTypeId=14)

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`); }
}

// day 2만 있는(1, 3일차는 아직 없는) 3박4일 일정으로 시작 — "없는 day 자동 생성 + 정렬"을
// 실제로 검증하기 위해 일부러 이렇게 구성한다.
const testItinerary: Itinerary = {
  request: { destination: "테스트목적지", region: "국내", memberType: "혼자", memberCount: 1, nights: 3, month: 1, purposes: [], notes: "" },
  destinationName: "테스트목적지",
  region: "국내",
  days: [{ day: 2, label: "2일차", items: [] }],
  estimatedTotalCost: 0,
  currency: "KRW",
  generatedAt: new Date().toISOString(),
  tripTips: { climate: "", packingList: [], recentIssues: [] },
};

async function main() {
  let itineraryId: string | null = null;
  try {
    itineraryId = await saveItinerary(testItinerary, TEST_USER_ID);
    console.log(`테스트 일정 생성(2일차만 존재): ${itineraryId}`);

    const placeA = await getPlaceById(PLACE_A);
    const placeB = await getPlaceById(PLACE_B);
    if (!placeA || !placeB) throw new Error("place null, 중단");

    // 1. 이미 존재하는 2일차에 추가
    await addPlaceToItinerary(itineraryId, TEST_USER_ID, placeA, 2);
    let current = await getItinerary(itineraryId, TEST_USER_ID);
    let day2 = current?.days.find((d) => d.day === 2);
    check("기존 2일차에 정상 추가", day2?.items.some((i) => i.placeId === placeA.id) === true, "");

    // 2. 존재하지 않는 4일차에 추가 → day가 새로 생성돼야 함
    await addPlaceToItinerary(itineraryId, TEST_USER_ID, placeB, 4);
    current = await getItinerary(itineraryId, TEST_USER_ID);
    const day4 = current?.days.find((d) => d.day === 4);
    check("존재하지 않던 4일차가 자동 생성됨", day4 !== undefined, "");
    check("4일차에 장소가 정상 추가됨", day4?.items.some((i) => i.placeId === placeB.id) === true, "");
    check("4일차 label이 'N일차' 형식으로 생성됨", day4?.label === "4일차", day4?.label);

    // 3. 존재하지 않는 1일차에도 추가 → 전체 day 순서가 오름차순(1,2,4)으로 정렬돼야 함
    await addPlaceToItinerary(itineraryId, TEST_USER_ID, placeA, 1);
    current = await getItinerary(itineraryId, TEST_USER_ID);
    const dayNumbers = current?.days.map((d) => d.day) ?? [];
    check("day 순서가 오름차순으로 정렬됨(1,2,4)", JSON.stringify(dayNumbers) === JSON.stringify([1, 2, 4]), JSON.stringify(dayNumbers));

    // 4. 2일차는 여전히 그대로 남아있어야 함(다른 day 추가가 기존 day를 건드리지 않음)
    day2 = current?.days.find((d) => d.day === 2);
    check("2일차 항목이 그대로 보존됨", day2?.items.length === 1 && day2.items[0].placeId === placeA.id, "");
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
