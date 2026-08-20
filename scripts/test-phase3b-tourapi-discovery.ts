/**
 * PHASE 3-B — 한국관광공사 TourAPI(KorService2) 소량 연결 테스트 (INSERT 없음, 서울 1회, 5건).
 *
 * 실행: dotenv -e .env.local -- tsx scripts/test-phase3b-tourapi-discovery.ts
 *
 * 목적: API 연결 및 응답 구조 확인뿐이다. areaBasedList2를 서울(areaCode=1) 대상으로
 * 딱 1회, 최대 5건만 호출한다. 응답 원문 전체는 출력하지 않고, 필드 존재 여부와 데이터
 * 구조 요약만 출력한다. places에는 저장하지 않는다.
 *
 * master에는 이 API를 호출하는 코드가 이전에 없었다 — 이번에 처음 작성한다.
 */
export {}; // 파일을 독립 모듈 스코프로 만들어 다른 스크립트 파일과 top-level 변수명이 충돌하지 않게 함

const SERVICE_KEY = process.env.TOUR_API_SERVICE_KEY;
const BASE_URL = process.env.TOUR_API_BASE_URL ?? "https://apis.data.go.kr/B551011/KorService2";

if (!SERVICE_KEY) {
  console.error("중단: TOUR_API_SERVICE_KEY가 설정되어 있지 않습니다.");
  process.exit(1);
}

// 조사 결과(§2 보고 참고) 기준 표준 지역코드. 서울=1.
const TEST_AREA_CODE = "1";
const TEST_NUM_OF_ROWS = "5";

/**
 * 공공데이터포털 서비스키는 이미 URL-encoding된 상태로 발급되는 경우가 많다. URLSearchParams로
 * 다시 넣으면 이중 인코딩되어 인증이 실패할 수 있어, 쿼리스트링을 수동으로 조립하고 serviceKey만
 * 원문 그대로 붙인다(다른 파라미터는 정상적으로 encodeURIComponent 처리). 인증키 값 자체는
 * 어떤 console.log에도 넣지 않는다.
 */
function buildUrl(path: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${BASE_URL}/${path}?serviceKey=${SERVICE_KEY}&${query}`;
}

async function main() {
  console.log("=== TourAPI(KorService2) 소량 연결 테스트 — 서울, 1회 호출, 최대 5건, INSERT 없음 ===");

  const url = buildUrl("areaBasedList2", {
    numOfRows: TEST_NUM_OF_ROWS,
    pageNo: "1",
    MobileOS: "ETC",
    MobileApp: "TripTubeAI",
    _type: "json",
    areaCode: TEST_AREA_CODE,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let httpStatus: number | null = null;
  let text: string;
  try {
    const res = await fetch(url, { signal: controller.signal });
    httpStatus = res.status;
    text = await res.text();
  } catch (e) {
    console.log(`API_CONNECTION=failed (네트워크 오류: ${e})`);
    return;
  } finally {
    clearTimeout(timeout);
  }

  console.log(`HTTP_STATUS=${httpStatus}`);

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증 실패 등은 XML로 오는 경우가 흔하다. 원문은 인증키를 포함하지 않으므로 일부만 노출한다
    // (에러 진단 목적, 관광 데이터 자체가 아님).
    console.log("API_CONNECTION=failed (JSON 아님 — 서비스키/파라미터 오류 가능성)");
    console.log(`  응답 앞부분(진단용, 200자): ${text.slice(0, 200)}`);
    return;
  }

  const header = json?.response?.header;
  const resultCode = header?.resultCode;
  const resultMsg = header?.resultMsg;
  console.log(`RESPONSE_STATUS=${resultCode} (${resultMsg})`);

  if (resultCode !== "0000" && resultCode !== "00") {
    console.log("API_CONNECTION=failed (정상 코드 아님)");
    return;
  }
  console.log("API_CONNECTION=success");

  const items: any[] = json?.response?.body?.items?.item ?? [];
  const totalCount = json?.response?.body?.totalCount;
  console.log(`SAMPLE_COUNT=${Array.isArray(items) ? items.length : 0} (totalCount=${totalCount})`);

  if (!Array.isArray(items) || items.length === 0) {
    console.log("반환된 item이 없습니다 — areaCode 값 재확인 필요.");
    return;
  }

  // 원문 전체는 출력하지 않는다. 필드 이름과 "값이 있는지/비어있는지"만 요약한다.
  const fieldPresence = new Map<string, { present: number; empty: number }>();
  for (const it of items) {
    for (const key of Object.keys(it)) {
      const stat = fieldPresence.get(key) ?? { present: 0, empty: 0 };
      const v = it[key];
      if (v === undefined || v === null || v === "") stat.empty++;
      else stat.present++;
      fieldPresence.set(key, stat);
    }
  }

  console.log("\n필드 구조 요약 (필드명 — 5건 중 값 있음/비어있음):");
  for (const [key, stat] of [...fieldPresence.entries()].sort()) {
    console.log(`  ${key}: 값있음 ${stat.present} / 비어있음 ${stat.empty}`);
  }

  // 민감하지 않은 대표 필드(제목, id류)만 짧게 예시로 — 원문 통째 출력이 아니라 식별용 최소 정보.
  console.log("\n예시(제목만, 5건):");
  for (const it of items) {
    console.log(`  contentId=${it.contentid} contentTypeId=${it.contenttypeid} title="${it.title}"`);
  }

  console.log("\n=== 연결 테스트 종료 (DB 변경 없음) ===");
}

main().catch((error) => {
  console.error("TourAPI 연결 테스트 실패:", error);
  process.exit(1);
});
