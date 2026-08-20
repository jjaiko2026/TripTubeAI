/**
 * PHASE 3-I — 품질 규칙 단위 테스트 (docs/PHASE3H_DATA_QUALITY_RULES.md 구현 검증).
 *
 * 실행: npx tsx scripts/test-phase3i-quality-rules-unit.ts
 *
 * 네트워크/DB를 전혀 건드리지 않는다 — src/lib/tour-api/quality.ts의 순수 함수만 검증한다.
 * 이 프로젝트에는 기존에 테스트 프레임워크(vitest/jest 등)가 없어, 기존 scripts/test-phase3*.ts
 * 컨벤션(tsx로 직접 실행, PASS/FAIL을 콘솔에 출력)을 그대로 재사용했다 — 새 의존성을 추가하지
 * 않기 위함.
 */
export {};

import {
  normalizeHomepage,
  normalizeTel,
  normalizeOverview,
  coalesceIfEmpty,
  parseExternalModifiedAt,
  decideRecollectionAction,
  validateCoordinate,
  validateRegionMapping,
  mapContentTypeToCategory,
} from "@/lib/tour-api/quality";

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

console.log("=== homepage 정제 (1~7) ===");

// 1. 순수 URL
{
  const r = normalizeHomepage("https://example.com");
  check("1. 순수 URL", r.value === "https://example.com" && r.warning === null && r.changed === false, JSON.stringify(r));
}

// 2. 정상 HTML anchor (Phase 3-G 실측: 강동아트센터)
{
  const raw = '<a href="https://www.gdfac.or.kr/" target="_blank" title="새창 : 강동아트센터 홈페이지로 이동">https://www.gdfac.or.kr/</a>';
  const r = normalizeHomepage(raw);
  check("2. 정상 HTML anchor", r.value === "https://www.gdfac.or.kr/" && r.warning === null && r.changed === true, JSON.stringify(r));
}

// 3. 깨진 HTML anchor (Phase 3-G 실측: 가새기오름 — target= 앞 공백 누락)
{
  const raw = '<a href="https://www.visitjeju.net/kr"새창 : 제주 문화관광 사이트로 이동">https://www.visitjeju.net/kr</a>';
  const r = normalizeHomepage(raw);
  check("3. 깨진 HTML anchor", r.value === "https://www.visitjeju.net/kr" && r.warning === null && r.changed === true, JSON.stringify(r));
}

// 4. 빈 homepage
{
  const r1 = normalizeHomepage("");
  const r2 = normalizeHomepage(null);
  check("4. 빈 homepage", r1.value === null && r1.warning === null && r2.value === null && r2.warning === null, JSON.stringify({ r1, r2 }));
}

// 5. http URL
{
  const r = normalizeHomepage("http://example.com");
  check("5. http URL", r.value === "http://example.com" && r.warning === null, JSON.stringify(r));
}

// 6. https URL
{
  const r = normalizeHomepage("https://example.com/path?q=1");
  check("6. https URL", r.value === "https://example.com/path?q=1" && r.warning === null, JSON.stringify(r));
}

// 7. invalid URL (href도 아니고 http(s)도 아님 — 원본 보존 + warning)
{
  const raw = "문의: 02-1234-5678";
  const r = normalizeHomepage(raw);
  check("7. invalid URL", r.value === raw && r.warning === "HOMEPAGE_INVALID" && r.changed === false, JSON.stringify(r));
}

console.log("\n=== modifiedtime (8~9) ===");

// 8. 정상 modifiedtime
{
  const r = parseExternalModifiedAt("20260819123045");
  const ok =
    r.warning === null &&
    r.value !== null &&
    r.value.getUTCFullYear() === 2026 &&
    r.value.getUTCMonth() === 7 &&
    r.value.getUTCDate() === 19 &&
    r.value.getUTCHours() === 12 &&
    r.value.getUTCMinutes() === 30 &&
    r.value.getUTCSeconds() === 45;
  check("8. 정상 modifiedtime", ok, JSON.stringify(r));
}

// 9. invalid modifiedtime (13월)
{
  const r = parseExternalModifiedAt("20261319123045");
  check("9. invalid modifiedtime(13월)", r.value === null && r.warning === "INVALID_MODIFIED_AT", JSON.stringify(r));
}
{
  const r = parseExternalModifiedAt("202608191230"); // 12자리(길이 오류)
  check("9-2. invalid modifiedtime(길이 오류)", r.value === null && r.warning === "INVALID_MODIFIED_AT", JSON.stringify(r));
}

console.log("\n=== 좌표 (10~12) ===");

// 10. 정상 국내 좌표 (서울시청 근방)
{
  const r = validateCoordinate("37.5061", "126.8684");
  check("10. 정상 국내 좌표", r.warnings.length === 0 && r.lat === 37.5061 && r.lng === 126.8684, JSON.stringify(r));
}

// 11. 해외 좌표 (Phase 3-D 실측: 계남근린공원)
{
  const r = validateCoordinate("19.69442748", "117.9925662504");
  check("11. 해외 좌표(계남근린공원 실측)", r.warnings.includes("OUT_OF_KOREA_BOUNDS"), JSON.stringify(r));
}

// 12. 0,0
{
  const r = validateCoordinate("0", "0");
  check("12. 0,0 좌표", r.warnings.includes("ZERO_COORDINATE"), JSON.stringify(r));
}

console.log("\n=== 지역 매핑 (13~17, 반드시 구분) ===");

// 13. 제주 sigunguCode=3 (서귀포시, 정상)
{
  const r = validateRegionMapping({ areaCode: "39", sigunguCode: "3" }, { areaCode: "39", sigunguCode: "3" });
  check("13. 제주 sigunguCode=3(서귀포시)", r.ok === true && r.error === null, JSON.stringify(r));
}

// 14. 제주 sigunguCode=4 (제주시, 정상)
{
  const r = validateRegionMapping({ areaCode: "39", sigunguCode: "4" }, { areaCode: "39", sigunguCode: "4" });
  check("14. 제주 sigunguCode=4(제주시)", r.ok === true && r.error === null, JSON.stringify(r));
}

// 15. 제주 areaCode=39 + sigunguCode=1 (남제주군, 폐지 — expected가 같아도 반드시 차단)
{
  const r = validateRegionMapping({ areaCode: "39", sigunguCode: "1" }, { areaCode: "39", sigunguCode: "1" });
  check("15. 제주 areaCode=39+sigunguCode=1(남제주군, 폐지)", r.ok === false && r.error === "LEGACY_JEJU_SIGUNGU", JSON.stringify(r));
}

// 16. 제주 areaCode=39 + sigunguCode=2 (북제주군, 폐지)
{
  const r = validateRegionMapping({ areaCode: "39", sigunguCode: "2" }, { areaCode: "39", sigunguCode: "2" });
  check("16. 제주 areaCode=39+sigunguCode=2(북제주군, 폐지)", r.ok === false && r.error === "LEGACY_JEJU_SIGUNGU", JSON.stringify(r));
}

// 17. 서울 areaCode=1 + sigunguCode=1/2 (제주 폐지코드와 값만 같을 뿐, 서울에서는 정상)
{
  const r1 = validateRegionMapping({ areaCode: "1", sigunguCode: "1" }, { areaCode: "1", sigunguCode: null });
  const r2 = validateRegionMapping({ areaCode: "1", sigunguCode: "2" }, { areaCode: "1", sigunguCode: null });
  check(
    "17. 서울 areaCode=1+sigunguCode=1/2(정상, 제주 폐지코드와 무관)",
    r1.ok === true && r1.error === null && r2.ok === true && r2.error === null,
    JSON.stringify({ r1, r2 })
  );
}

console.log("\n=== 지역 매핑 — 추가 케이스(불일치 하드스톱 확인) ===");
{
  const r = validateRegionMapping({ areaCode: "6", sigunguCode: null }, { areaCode: "1", sigunguCode: null });
  check("areaCode 불일치 → AREA_CODE_MISMATCH", r.ok === false && r.error === "AREA_CODE_MISMATCH", JSON.stringify(r));
}
{
  const r = validateRegionMapping({ areaCode: "39", sigunguCode: "3" }, { areaCode: "39", sigunguCode: "4" });
  check("sigunguCode 불일치 → SIGUNGU_CODE_MISMATCH", r.ok === false && r.error === "SIGUNGU_CODE_MISMATCH", JSON.stringify(r));
}

console.log("\n=== overview / tel / coalesce ===");
{
  const r = normalizeOverview("  설명입니다  ");
  check("overview 공백 트리밍", r === "설명입니다", JSON.stringify(r));
}
{
  const r = normalizeOverview("");
  check("overview 빈 값 → null", r === null, JSON.stringify(r));
}
{
  const r = normalizeTel("010-1234-5678");
  check("tel 정상 형식", r.value === "010-1234-5678" && r.warning === null, JSON.stringify(r));
}
{
  const r = normalizeTel("문의는 카톡으로");
  check("tel 비정상 형식 → warning, 값은 보존", r.value === "문의는 카톡으로" && r.warning === "TEL_FORMAT_UNUSUAL", JSON.stringify(r));
}
{
  const r = coalesceIfEmpty("", "기존값");
  check("coalesceIfEmpty: 빈 문자열 → 기존값 유지", r === "기존값", JSON.stringify(r));
}
{
  const r = coalesceIfEmpty("새값", "기존값");
  check("coalesceIfEmpty: 새 값이 있으면 새 값", r === "새값", JSON.stringify(r));
}
{
  const r = coalesceIfEmpty(null, "기존값");
  check("coalesceIfEmpty: null → 기존값 유지", r === "기존값", JSON.stringify(r));
}

console.log("\n=== 재수집 정책 ===");
{
  const r = decideRecollectionAction(new Date("2025-01-01"), new Date("2026-01-01"));
  check("재수집: 새 값이 더 최근 → UPDATE", r === "UPDATE", r);
}
{
  const r = decideRecollectionAction(new Date("2026-01-01"), new Date("2025-01-01"));
  check("재수집: 새 값이 더 과거 → SKIP", r === "SKIP", r);
}
{
  const r = decideRecollectionAction(new Date("2026-01-01"), new Date("2026-01-01"));
  check("재수집: 동일 → SKIP", r === "SKIP", r);
}
{
  const r = decideRecollectionAction(null, new Date("2026-01-01"));
  check("재수집: 기존 값 없음 + 새 값 있음 → UPDATE", r === "UPDATE", r);
}
{
  const r = decideRecollectionAction(new Date("2026-01-01"), null);
  check("재수집: 새 값 파싱 실패(null) → SKIP", r === "SKIP", r);
}

console.log("\n=== contentType 매핑 ===");
{
  const cases: [string, string][] = [
    ["12", "tourism"],
    ["14", "tourism"],
    ["15", "experience"],
    ["25", "course"],
    ["28", "experience"],
    ["32", "accommodation"],
    ["38", "shopping"],
    ["39", "food"],
  ];
  for (const [id, expected] of cases) {
    const r = mapContentTypeToCategory(id);
    check(`contentType ${id} → ${expected}`, r === expected, `실제=${r}`);
  }
  const unknown = mapContentTypeToCategory("99");
  check("contentType 미정의 값 → null", unknown === null, String(unknown));
}

console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL (총 ${passed + failed}건) ===`);
if (failed > 0) {
  console.log("단위 테스트 실패 — 실제 TourAPI 소량 테스트로 진행하지 않는다.");
  process.exit(1);
}
console.log("전체 통과 — 실제 TourAPI 소량 테스트 준비 가능.");
