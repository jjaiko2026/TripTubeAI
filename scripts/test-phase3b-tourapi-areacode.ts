/**
 * TourAPI areaCode2(지역코드 조회) 실검증. INSERT 없음, DB 변경 없음.
 * 목적: 서울/부산/제주(시도) + 제주 하위 시군구(제주시/서귀포시) 코드를 실제 API로 확인하고,
 * 우리 regions.code(KR-SEOUL-CITY 등)와의 매핑을 검증한다.
 *
 * 실행: dotenv -e .env.local -- tsx scripts/test-phase3b-tourapi-areacode.ts
 */
export {}; // 독립 모듈 스코프

const SERVICE_KEY = process.env.TOUR_API_SERVICE_KEY;
const BASE_URL = process.env.TOUR_API_BASE_URL ?? "https://apis.data.go.kr/B551011/KorService2";

if (!SERVICE_KEY) {
  console.error("중단: TOUR_API_SERVICE_KEY가 설정되어 있지 않습니다.");
  process.exit(1);
}

function buildUrl(params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${BASE_URL}/areaCode2?serviceKey=${SERVICE_KEY}&${query}`;
}

async function callAreaCode(params: Record<string, string>): Promise<any[]> {
  const url = buildUrl({ numOfRows: "50", pageNo: "1", MobileOS: "ETC", MobileApp: "TripTubeAI", _type: "json", ...params });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      console.error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      return [];
    }
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      console.error(`JSON 파싱 실패: ${text.slice(0, 300)}`);
      return [];
    }
    const header = json?.response?.header;
    if (header?.resultCode !== "0000" && header?.resultCode !== "00") {
      console.error(`resultCode=${header?.resultCode} resultMsg=${header?.resultMsg}`);
      return [];
    }
    const items = json?.response?.body?.items?.item;
    return Array.isArray(items) ? items : items ? [items] : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log("=== TourAPI areaCode2 실검증 (INSERT 없음) ===\n");

  console.log("--- 1) 시/도 목록 조회 (areaCode 파라미터 없음) ---");
  const topLevel = await callAreaCode({});
  console.log(`반환 ${topLevel.length}건`);
  for (const it of topLevel) console.log(`  code=${it.code} name=${it.name}`);

  const seoul = topLevel.filter((it) => it.name.includes("서울"));
  const busan = topLevel.filter((it) => it.name.includes("부산"));
  const jeju = topLevel.filter((it) => it.name.includes("제주"));

  console.log("\n--- 2) 제주 하위 시/군/구 조회 (areaCode=제주 코드) ---");
  let jejuSub: any[] = [];
  if (jeju.length === 1) {
    jejuSub = await callAreaCode({ areaCode: jeju[0].code });
    console.log(`areaCode=${jeju[0].code} 기준 반환 ${jejuSub.length}건`);
    for (const it of jejuSub) console.log(`  code=${it.code} name=${it.name}`);
  } else {
    console.log(`중단 필요: 제주 시/도 코드가 ${jeju.length}건 매칭됨(1건이어야 함) — 아래 참고`);
  }

  const jejusi = jejuSub.filter((it) => it.name.includes("제주시"));
  const seogwipo = jejuSub.filter((it) => it.name.includes("서귀포"));

  console.log("\n=== 매핑 결과 표 ===");
  const rows = [
    { ourCode: "KR-SEOUL-CITY", ourName: "서울", matches: seoul, sigunguOf: null as string | null },
    { ourCode: "KR-BUSAN-CITY", ourName: "부산", matches: busan, sigunguOf: null },
    { ourCode: "KR-JEJU", ourName: "제주(도 전체)", matches: jeju, sigunguOf: null },
    { ourCode: "KR-JEJU-JEJUSI", ourName: "제주시", matches: jejusi, sigunguOf: jeju[0]?.code ?? null },
    { ourCode: "KR-JEJU-SEOGWIPO", ourName: "서귀포시", matches: seogwipo, sigunguOf: jeju[0]?.code ?? null },
  ];

  for (const r of rows) {
    if (r.matches.length !== 1) {
      console.log(
        `\n[중복/애매] ${r.ourCode}("${r.ourName}") — 후보 ${r.matches.length}건: ${JSON.stringify(r.matches)}`
      );
      continue;
    }
    const m = r.matches[0];
    console.log(`\n${r.ourCode}`);
    console.log(`  region name(우리): ${r.ourName}`);
    console.log(`  TourAPI areaCode: ${r.sigunguOf ?? m.code}`);
    console.log(`  TourAPI sigunguCode: ${r.sigunguOf ? m.code : "(해당없음, 시도 레벨)"}`);
    console.log(`  API 반환 지역명: ${m.name}`);
    console.log(`  매핑 결과: 성공(1:1 매칭)`);
  }

  console.log("\n=== 검증 종료 (DB 변경 없음) ===");
}

main().catch((error) => {
  console.error("areaCode 검증 실패:", error);
  process.exit(1);
});
