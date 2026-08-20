/**
 * PHASE 3-L-1 — getPlacesByRegion() 검증 (src/db/queries.ts).
 *
 * 실행: dotenv -e .env.local -- tsx scripts/test-phase3l1-places-query-unit.ts
 *
 * READ-ONLY SELECT만 수행한다 — INSERT/UPDATE/DELETE 없음, TourAPI 호출 없음.
 * K-4/K-5 단위 테스트(test-phase3k4/5-*.ts)와 달리 이 함수는 DB를 직접 읽으므로
 * 순수 함수 단위 테스트가 아니라 실제 조회 결과를 검증하는 통합 스모크 테스트다.
 */
export {};

import { getPlacesByRegion } from "@/db/queries";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("=== KR-SEOUL-CITY 조회 (40건 기대) ===");
  const seoul = await getPlacesByRegion("KR-SEOUL-CITY");
  check("서울 40건 반환", seoul.length === 40, `실제=${seoul.length}`);
  check("전부 detailData 존재(보유율 100%)", seoul.every((p) => p.detailData !== null), "");

  console.log("\n=== KR-JEJU-JEJUSI 조회 (40건 기대) ===");
  const jejusi = await getPlacesByRegion("KR-JEJU-JEJUSI");
  check("제주시 40건 반환", jejusi.length === 40, `실제=${jejusi.length}`);

  console.log("\n=== KR-JEJU-SEOGWIPO 조회 (40건 기대) ===");
  const seogwipo = await getPlacesByRegion("KR-JEJU-SEOGWIPO");
  check("서귀포시 40건 반환", seogwipo.length === 40, `실제=${seogwipo.length}`);

  console.log("\n=== 존재하지 않는 regionCode ===");
  const none = await getPlacesByRegion("KR-DOES-NOT-EXIST");
  check("빈 배열 반환", none.length === 0, `실제=${none.length}`);

  console.log("\n=== 좌표 신뢰성 판정 재사용 확인(계남근린공원, contentId=2611568) ===");
  const gyenam = seoul.find((p) => p.name === "계남근린공원");
  check("계남근린공원이 서울 목록에 존재", gyenam !== undefined, "");
  if (gyenam) {
    check("coordinateReliable === false", gyenam.coordinateReliable === false, JSON.stringify(gyenam.coordinateReliable));
    check("lat/lng 원본값 그대로 반환(수정 없음)", gyenam.lat === "19.69442748" && gyenam.lng === "117.9925662504", `lat=${gyenam.lat}, lng=${gyenam.lng}`);
  }

  console.log("\n=== homepage 판정 재사용 확인(김영갑갤러리두모악, contentId=130723) ===");
  const dumoak = seoul.find((p) => p.name === "김영갑갤러리두모악") ?? jejusi.find((p) => p.name === "김영갑갤러리두모악") ?? seogwipo.find((p) => p.name === "김영갑갤러리두모악");
  check("김영갑갤러리두모악 발견", dumoak !== undefined, "");
  if (dumoak) {
    check("homepage.status === CLICKABLE", dumoak.homepage.status === "CLICKABLE", JSON.stringify(dumoak.homepage));
    check("homepage.url이 원본 HTML이 아니라 정제된 URL", dumoak.homepage.url === "http://www.dumoak.co.kr/", String(dumoak.homepage.url));
  }

  console.log("\n=== NON_CLICKABLE 사례 재사용 확인(구엄어촌체험마을, contentId=129073) ===");
  const guem = jejusi.find((p) => p.name === "구엄어촌체험마을");
  check("구엄어촌체험마을 발견", guem !== undefined, "");
  if (guem) {
    check("homepage.status === NON_CLICKABLE", guem.homepage.status === "NON_CLICKABLE", JSON.stringify(guem.homepage));
    check("NON_CLICKABLE이면 url은 항상 null(원본 HTML 미노출)", guem.homepage.url === null, String(guem.homepage.url));
  }

  console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL (총 ${passed + failed}건) ===`);
  if (failed > 0) {
    console.log("검증 실패 — getPlacesByRegion 구현을 재확인해야 한다.");
    process.exit(1);
  }
  console.log("전체 통과.");
}

main().catch((e) => {
  console.error("오류:", e?.message ?? e);
  process.exit(1);
});
