/**
 * PHASE 3-K-4 — getHomepageDisplayStatus() 단위 테스트
 * (docs/PHASE3K_QUALITY_POLICY.md §6 구현 검증, src/lib/tour-api/quality.ts).
 *
 * 실행: npx tsx scripts/test-phase3k4-homepage-unit.ts
 *
 * 네트워크/DB를 전혀 건드리지 않는다 — quality.ts의 순수 함수만 검증한다.
 * scripts/test-phase3i-quality-rules-unit.ts와 동일한 컨벤션(tsx로 직접 실행,
 * PASS/FAIL을 콘솔에 출력)을 그대로 재사용했다 — 새 테스트 프레임워크 도입 없음.
 */
export {};

import { getHomepageDisplayStatus } from "@/lib/tour-api/quality";

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

console.log("=== PHASE 3-K-4 PREVIEW 표준 케이스 (1~12) ===");

// 1. null
{
  const r = getHomepageDisplayStatus(null);
  check("1. null → NO_HOMEPAGE/null", r.status === "NO_HOMEPAGE" && r.url === null, JSON.stringify(r));
}

// 2. ""
{
  const r = getHomepageDisplayStatus("");
  check('2. "" → NO_HOMEPAGE/null', r.status === "NO_HOMEPAGE" && r.url === null, JSON.stringify(r));
}

// 3. " " (whitespace)
{
  const r = getHomepageDisplayStatus(" ");
  check('3. " " → NO_HOMEPAGE/null', r.status === "NO_HOMEPAGE" && r.url === null, JSON.stringify(r));
}

// 4. https://example.com
{
  const r = getHomepageDisplayStatus("https://example.com");
  check("4. https URL → CLICKABLE", r.status === "CLICKABLE" && r.url === "https://example.com", JSON.stringify(r));
}

// 5. http://example.com
{
  const r = getHomepageDisplayStatus("http://example.com");
  check("5. http URL → CLICKABLE", r.status === "CLICKABLE" && r.url === "http://example.com", JSON.stringify(r));
}

// 6. HTML anchor, http(s) href
{
  const r = getHomepageDisplayStatus('<a href="https://example.com">...</a>');
  check("6. HTML anchor(정상 href) → CLICKABLE", r.status === "CLICKABLE" && r.url === "https://example.com", JSON.stringify(r));
}

// 7. HTML anchor, 스킴 없는 href
{
  const r = getHomepageDisplayStatus('<a href="www.example.com">...</a>');
  check("7. HTML anchor(스킴 없음) → NON_CLICKABLE/null", r.status === "NON_CLICKABLE" && r.url === null, JSON.stringify(r));
}

// 8. www.example.com (href 없음, http(s) 아님)
{
  const r = getHomepageDisplayStatus("www.example.com");
  check("8. www.example.com → NON_CLICKABLE/null", r.status === "NON_CLICKABLE" && r.url === null, JSON.stringify(r));
}

// 9. javascript: 스킴
{
  const r = getHomepageDisplayStatus("javascript:alert(1)");
  check("9. javascript: → NON_CLICKABLE/null", r.status === "NON_CLICKABLE" && r.url === null, JSON.stringify(r));
}

// 10. data: 스킴
{
  const r = getHomepageDisplayStatus("data:text/html,<script>alert(1)</script>");
  check("10. data: → NON_CLICKABLE/null", r.status === "NON_CLICKABLE" && r.url === null, JSON.stringify(r));
}

// 11. HTML injection 시도 (href 패턴 자체가 없음)
{
  const r = getHomepageDisplayStatus("<img src=x onerror=alert(1)>");
  check("11. HTML injection 문자열 → NON_CLICKABLE/null", r.status === "NON_CLICKABLE" && r.url === null, JSON.stringify(r));
}

// 12. 한글 도메인
{
  const r = getHomepageDisplayStatus("한글도메인.kr");
  check("12. 한글 도메인 → NON_CLICKABLE/null", r.status === "NON_CLICKABLE" && r.url === null, JSON.stringify(r));
}

console.log("\n=== 실제 DB 6건 재현 (Phase 3-K-1/3-K-4 PREVIEW 실측값 그대로, 13) ===");

// 13. 실제 DB에 저장된 6건의 원본 문자열을 그대로 하드코딩해 재현
{
  const raw = '<a href="http://www.dumoak.co.kr/" target="_blank" title="새창 : 두모악 홈페이지로 이동">http://www.dumoak.co.kr</a>';
  const r = getHomepageDisplayStatus(raw);
  check(
    "13-1. 김영갑갤러리두모악(130723) → CLICKABLE",
    r.status === "CLICKABLE" && r.url === "http://www.dumoak.co.kr/",
    JSON.stringify(r)
  );
}
{
  const raw = '<a href="https://www.gdfac.or.kr/" target="_blank" title="새창 : 강동아트센터 홈페이지로 이동">https://www.gdfac.or.kr/</a>';
  const r = getHomepageDisplayStatus(raw);
  check(
    "13-2. 강동아트센터(1750737) → CLICKABLE",
    r.status === "CLICKABLE" && r.url === "https://www.gdfac.or.kr/",
    JSON.stringify(r)
  );
}
{
  const raw = '<a href="https://www.visitjeju.net/kr"새창 : 제주 문화관광 사이트로 이동">https://www.visitjeju.net/kr</a>';
  const r = getHomepageDisplayStatus(raw);
  check(
    "13-3. 가새기오름(1884521) → CLICKABLE",
    r.status === "CLICKABLE" && r.url === "https://www.visitjeju.net/kr",
    JSON.stringify(r)
  );
}
{
  const raw = '<a href="https://www.visitjeju.net/u/EnR" target="_blank" title="새창 : 홈페이지로 이동">www.visitjeju.net</a>';
  const r = getHomepageDisplayStatus(raw);
  check(
    "13-4. 성김대건신부표착기념관(2752772) → CLICKABLE",
    r.status === "CLICKABLE" && r.url === "https://www.visitjeju.net/u/EnR",
    JSON.stringify(r)
  );
}
{
  const raw = '<a href="https://www.instagram.com/gasieomeong_gimbap"target="_blank" title="새창: 가시어멍김밥 홈페이지로 이동">https://www.instagram.com/gasieomeong_gimbap</a>';
  const r = getHomepageDisplayStatus(raw);
  check(
    "13-5. 가시어멍김밥(2837181) → CLICKABLE",
    r.status === "CLICKABLE" && r.url === "https://www.instagram.com/gasieomeong_gimbap",
    JSON.stringify(r)
  );
}
{
  const raw = '<a href="www.구엄어촌체험마을.kr" target="_blank" title="새창 : 구엄어촌체험마을 홈페이지로 이동">www.구엄어촌체험마을.kr</a>';
  const r = getHomepageDisplayStatus(raw);
  check(
    "13-6. 구엄어촌체험마을(129073) → NON_CLICKABLE/null",
    r.status === "NON_CLICKABLE" && r.url === null,
    JSON.stringify(r)
  );
}

console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL (총 ${passed + failed}건) ===`);
if (failed > 0) {
  console.log("단위 테스트 실패 — getHomepageDisplayStatus 구현을 재확인해야 한다.");
  process.exit(1);
}
console.log("전체 통과.");
