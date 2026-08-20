/**
 * MY ITINERARIES v1 — /plan/mine이 의존하는 getRecentItinerariesForUser(limit=100) 검증.
 * 이 함수 자체는 이미 존재/검증됐지만(limit=3으로만 호출돼왔음), 큰 limit으로 호출해도
 * 정상 동작하는지, 그리고 여러 개 생성했을 때 최신순으로 전부 반환되는지 확인한다.
 * 테스트 전용 userId로 생성한 일정만 다루고 검증 후 전부 정리한다.
 */
export {};

import { saveItinerary, getRecentItinerariesForUser, deleteItinerary } from "@/db/queries";
import type { Itinerary } from "@/lib/types";

const TEST_USER_ID = "test-phase3m1-verification";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`); }
}

function makeTestItinerary(destination: string): Itinerary {
  return {
    request: { destination, region: "국내", memberType: "혼자", memberCount: 1, nights: 1, month: 6, purposes: [], notes: "" },
    destinationName: destination,
    region: "국내",
    days: [{ day: 1, label: "1일차", items: [] }],
    estimatedTotalCost: 0,
    currency: "KRW",
    generatedAt: new Date().toISOString(),
    tripTips: { climate: "", packingList: [], recentIssues: [] },
  };
}

async function main() {
  const ids: string[] = [];
  try {
    console.log("=== 테스트 일정 5건 생성(순서대로) ===");
    for (const dest of ["A목적지", "B목적지", "C목적지", "D목적지", "E목적지"]) {
      const id = await saveItinerary(makeTestItinerary(dest), TEST_USER_ID);
      ids.push(id);
    }
    console.log(`  생성 완료: ${ids.length}건`);

    console.log("\n=== limit=100으로 전체 조회(/plan/mine과 동일 호출) ===");
    const all = await getRecentItinerariesForUser(TEST_USER_ID, 100);
    check("생성한 5건이 전부 조회됨", all.length === 5, String(all.length));
    check("최신순 정렬(가장 최근 생성한 E목적지가 첫 번째)", all[0]?.destinationName === "E목적지", all[0]?.destinationName);
    check("가장 먼저 만든 A목적지가 마지막", all[4]?.destinationName === "A목적지", all[4]?.destinationName);

    console.log("\n=== limit=3(기존 /plan/new 호출 방식)도 여전히 정상 동작(회귀 확인) ===");
    const limited = await getRecentItinerariesForUser(TEST_USER_ID, 3);
    check("limit=3이면 3건만 반환", limited.length === 3, String(limited.length));

    console.log("\n=== 하나 삭제 후 전체 목록에서 즉시 빠지는지 ===");
    await deleteItinerary(ids[0], TEST_USER_ID); // A목적지 삭제
    const afterDelete = await getRecentItinerariesForUser(TEST_USER_ID, 100);
    check("삭제한 A목적지가 목록에서 사라짐", !afterDelete.some((it) => it.destinationName === "A목적지"), "");
    check("나머지 4건은 그대로 남아있음", afterDelete.length === 4, String(afterDelete.length));
  } finally {
    for (const id of ids) {
      await deleteItinerary(id, TEST_USER_ID); // 이미 지운 것도 다시 지워도 안전(존재 안 하면 no-op)
    }
    const remaining = await getRecentItinerariesForUser(TEST_USER_ID, 100);
    check("정리: 테스트 일정 전부 삭제 확인", remaining.length === 0, `남은 건수=${remaining.length}`);
    console.log(`테스트 일정 ${ids.length}건 정리 완료`);
  }

  console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL (총 ${passed + failed}건) ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("오류:", e?.message ?? e);
  process.exit(1);
});
