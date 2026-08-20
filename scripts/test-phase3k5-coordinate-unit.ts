/**
 * PHASE 3-K-5 — isCoordinateReliable() 단위 테스트
 * (docs/PHASE3K_QUALITY_POLICY.md §5.3 구현 검증, src/lib/tour-api/quality.ts).
 *
 * 실행: npx tsx scripts/test-phase3k5-coordinate-unit.ts
 *
 * 네트워크/DB를 전혀 건드리지 않는다 — quality.ts의 순수 함수만 검증한다.
 * scripts/test-phase3k4-homepage-unit.ts와 동일한 컨벤션(tsx로 직접 실행,
 * PASS/FAIL을 콘솔에 출력)을 그대로 재사용했다.
 */
export {};

import { isCoordinateReliable, validateCoordinate } from "@/lib/tour-api/quality";

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

console.log("=== isCoordinateReliable() 케이스 ===");

// 1. 정상 국내 좌표 (서울시청 근방)
{
  const r = isCoordinateReliable("37.5061", "126.8684");
  check("1. 정상 국내 좌표 → true", r === true, String(r));
}

// 2. (0,0) — ZERO_COORDINATE
{
  const r = isCoordinateReliable("0", "0");
  check("2. (0,0) → false", r === false, String(r));
}

// 3. OUT_OF_KOREA_BOUNDS (Phase 3-D/3-K-1 실측: 계남근린공원)
{
  const r = isCoordinateReliable("19.69442748", "117.9925662504");
  check("3. 대한민국 권역 밖(계남근린공원 실측) → false", r === false, String(r));
  // 회귀 확인: validateCoordinate 자체가 여전히 OUT_OF_KOREA_BOUNDS를 내는지도 함께 확인
  const vc = validateCoordinate("19.69442748", "117.9925662504");
  check("3-1. validateCoordinate가 OUT_OF_KOREA_BOUNDS를 포함하는지", vc.warnings.includes("OUT_OF_KOREA_BOUNDS"), JSON.stringify(vc));
}

// 4. INVALID_NUMBER
{
  const r = isCoordinateReliable("이상한값", "126.8684");
  check("4. 숫자 아님 → false", r === false, String(r));
}

// 5. POSSIBLY_SWAPPED (lat/lng가 뒤바뀐 것으로 의심 — 서울시청 좌표를 뒤바꿔 입력)
{
  const r = isCoordinateReliable("126.8684", "37.5061");
  check("5. lat/lng 뒤바뀜 의심 → false", r === false, String(r));
  const vc = validateCoordinate("126.8684", "37.5061");
  check("5-1. validateCoordinate가 POSSIBLY_SWAPPED를 포함하는지", vc.warnings.includes("POSSIBLY_SWAPPED"), JSON.stringify(vc));
}

// 6. NULL 좌표 (둘 다 결측 — 정상 결측, 경고 아님)
{
  const r = isCoordinateReliable(null, null);
  check("6. lat/lng 둘 다 null → true(정상 결측, 신뢰불가 아님)", r === true, String(r));
}

console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL (총 ${passed + failed}건) ===`);
if (failed > 0) {
  console.log("단위 테스트 실패 — isCoordinateReliable 구현을 재확인해야 한다.");
  process.exit(1);
}
console.log("전체 통과.");
