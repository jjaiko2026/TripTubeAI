/**
 * PHASE 3-I — 품질 규칙 적용 소량 실데이터 반영 (INSERT/UPDATE 있음, 최대 6건, 숙박 제외).
 *
 * 실행: dotenv -e .env.local -- tsx scripts/test-phase3i-quality-apply.ts
 *
 * Phase 3-G-2(scripts/test-phase3g-tourapi-detail-apply.ts)와 골격이 같다 — 이번에 새로
 * 추가된 것은 src/lib/tour-api/quality.ts의 검증된 품질 규칙(homepage 정제, 좌표 검증,
 * areaCode+sigunguCode+지역명 결합 지역 매핑 검증, modifiedAt 파싱, 품질 warning 집계)을
 * 인라인 로직 대신 재사용 가능한 함수로 호출한다는 점뿐이다. DB 변경 허용 범위는 G-2와
 * 동일: places UPDATE(테스트 대상 contentId만) + place_tourism_details INSERT뿐.
 */
export {};

import { neon } from "@neondatabase/serverless";
import {
  normalizeHomepage,
  normalizeTel,
  normalizeOverview,
  parseExternalModifiedAt,
  validateCoordinate,
  validateRegionMapping,
  createQualityWarningCounts,
} from "@/lib/tour-api/quality";

const SERVICE_KEY = process.env.TOUR_API_SERVICE_KEY;
const BASE_URL = process.env.TOUR_API_BASE_URL ?? "https://apis.data.go.kr/B551011/KorService2";

if (!SERVICE_KEY) {
  console.error("중단: TOUR_API_SERVICE_KEY가 설정되어 있지 않습니다.");
  process.exit(1);
}

// PHASE 3-I PREVIEW에서 확정한 6건. Phase 3-G-2에서 이미 처리한 7건과 겹치지 않는
// 신규 후보만 골랐다(place_tourism_details LEFT JOIN으로 미수집 건만 조회, 읽기 전용 확인).
// 숙박(32) 제외.
const TEST_TARGETS = [
  { regionCode: "KR-SEOUL-CITY", regionNameKo: "서울", expectedAreaCode: "1", expectedSigunguCode: null as string | null, contentTypeId: "12", contentTypeNameKo: "관광지", contentId: "2930839" },
  { regionCode: "KR-SEOUL-CITY", regionNameKo: "서울", expectedAreaCode: "1", expectedSigunguCode: null as string | null, contentTypeId: "14", contentTypeNameKo: "문화시설", contentId: "130613" },
  { regionCode: "KR-JEJU-JEJUSI", regionNameKo: "제주시", expectedAreaCode: "39", expectedSigunguCode: "4", contentTypeId: "12", contentTypeNameKo: "관광지", contentId: "2946074" },
  { regionCode: "KR-JEJU-JEJUSI", regionNameKo: "제주시", expectedAreaCode: "39", expectedSigunguCode: "4", contentTypeId: "39", contentTypeNameKo: "음식점", contentId: "2853435" },
  { regionCode: "KR-JEJU-SEOGWIPO", regionNameKo: "서귀포시", expectedAreaCode: "39", expectedSigunguCode: "3", contentTypeId: "12", contentTypeNameKo: "관광지", contentId: "1887493" },
  { regionCode: "KR-JEJU-SEOGWIPO", regionNameKo: "서귀포시", expectedAreaCode: "39", expectedSigunguCode: "3", contentTypeId: "14", contentTypeNameKo: "문화시설", contentId: "2606611" },
] as const;

class HardStop extends Error {
  constructor(reason: string, detail: unknown) {
    super(`[HARD STOP: ${reason}] ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
}

function buildUrl(path: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${BASE_URL}/${path}?serviceKey=${SERVICE_KEY}&${query}`;
}

async function callApi(path: string, params: Record<string, string>): Promise<any[]> {
  const url = buildUrl(path, { MobileOS: "ETC", MobileApp: "TripTubeAI", _type: "json", ...params });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let text: string;
  try {
    const res = await fetch(url, { signal: controller.signal });
    text = await res.text();
    if (!res.ok) throw new HardStop("API 응답 구조 이상", `HTTP ${res.status}: ${text.slice(0, 300)}`);
  } finally {
    clearTimeout(timeout);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HardStop("API 응답 구조 이상", `JSON 파싱 실패: ${text.slice(0, 300)}`);
  }
  const header = json?.response?.header ?? json; // Phase 3-E에서 확인: 오류 응답은 flat 구조
  if (header?.resultCode !== "0000" && header?.resultCode !== "00") {
    throw new HardStop("API 응답 구조 이상", `resultCode=${header?.resultCode} resultMsg=${header?.resultMsg}`);
  }
  const rawItems = json?.response?.body?.items?.item;
  if (rawItems === "" || rawItems === undefined) return [];
  return Array.isArray(rawItems) ? rawItems : [rawItems];
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const warnings = createQualityWarningCounts();

  // ══════════════════════════ PRE-RUN CHECK (읽기 전용) ══════════════════════════
  const detailCountBefore = await sql`select count(*) as c from place_tourism_details`;
  const existingDetailRows = Number((detailCountBefore as any)[0].c);

  interface PreCheckRow {
    target: (typeof TEST_TARGETS)[number];
    placeId: string;
    currentTel: string | null;
    currentHomepage: string | null;
    currentOverview: string | null;
    currentModifiedAt: string | null;
    currentLat: string | null;
    currentLng: string | null;
  }
  const preChecked: PreCheckRow[] = [];
  const preCheckErrors: string[] = [];

  for (const t of TEST_TARGETS) {
    const rows = await sql`
      select id, tel, homepage, overview, external_modified_at, lat, lng
      from places
      where external_source = 'tour_api' and external_content_id = ${t.contentId}
    `;
    if (rows.length !== 1) {
      preCheckErrors.push(`contentId=${t.contentId}: places 매칭 ${rows.length}건 (기대값 1건)`);
      continue;
    }
    const p = rows[0] as any;
    const existingDetail = await sql`
      select id from place_tourism_details where place_id = ${p.id} and content_type_id = ${t.contentTypeId}
    `;
    if (existingDetail.length > 0) {
      preCheckErrors.push(`contentId=${t.contentId} (place_id=${p.id}, contentTypeId=${t.contentTypeId}): 기존 detail 데이터 ${existingDetail.length}건 발견`);
      continue;
    }
    preChecked.push({
      target: t,
      placeId: p.id,
      currentTel: p.tel,
      currentHomepage: p.homepage,
      currentOverview: p.overview,
      currentModifiedAt: p.external_modified_at,
      currentLat: p.lat,
      currentLng: p.lng,
    });
  }

  console.log("=== PHASE 3-I PRE-RUN CHECK ===");
  console.log(`- 대상 place: ${TEST_TARGETS.length}`);
  console.log(`- detailCommon2 예상 호출: ${TEST_TARGETS.length}`);
  console.log(`- detailIntro2 예상 호출: ${TEST_TARGETS.length}`);
  console.log(`- 최대 API 호출: ${TEST_TARGETS.length * 2}`);
  console.log(`- 기존 detail row: ${existingDetailRows}`);
  console.log(`- 숙박 테스트: 제외`);
  for (const p of preChecked) {
    const coordCheck = validateCoordinate(p.currentLat, p.currentLng);
    if (coordCheck.warnings.length > 0) warnings.invalidCoordinate++;
    console.log(
      `  [${p.target.regionNameKo}/${p.target.contentTypeNameKo}] contentId=${p.target.contentId} placeId=${p.placeId} 현재 좌표=(${p.currentLat},${p.currentLng}) 좌표경고=${coordCheck.warnings.join(",") || "없음"}`
    );
  }
  if (preCheckErrors.length > 0) {
    console.log("\n사전 확인 오류:");
    preCheckErrors.forEach((e) => console.log(`  ${e}`));
    throw new HardStop("사전 확인 실패", `${preCheckErrors.length}건의 오류 — 실행 중단, API 호출 0회`);
  }
  console.log("\n이상 없음 — 실행 시작\n");

  // ══════════════════════════ 실제 실행 ══════════════════════════
  let commonSuccess = 0;
  let introSuccess = 0;
  let apiCallCount = 0;
  let updateSuccess = 0;
  let insertSuccess = 0;

  for (const p of preChecked) {
    const t = p.target;
    console.log(`--- ${t.regionNameKo}/${t.contentTypeNameKo} contentId=${t.contentId} ---`);

    apiCallCount++;
    if (apiCallCount > TEST_TARGETS.length * 2) throw new HardStop("예상보다 많은 API 호출", `누적 ${apiCallCount}회`);
    const common = await callApi("detailCommon2", { contentId: t.contentId });
    if (common.length !== 1) throw new HardStop("API 응답 구조 이상", `detailCommon2 응답 ${common.length}건`);
    if (String(common[0].contentid) !== t.contentId) throw new HardStop("contentId 매칭 실패", `요청=${t.contentId}, 응답=${common[0].contentid}`);
    commonSuccess++;

    apiCallCount++;
    if (apiCallCount > TEST_TARGETS.length * 2) throw new HardStop("예상보다 많은 API 호출", `누적 ${apiCallCount}회`);
    const intro = await callApi("detailIntro2", { contentId: t.contentId, contentTypeId: t.contentTypeId });
    if (intro.length !== 1) throw new HardStop("API 응답 구조 이상", `detailIntro2 응답 ${intro.length}건`);
    if (String(intro[0].contentid) !== t.contentId || String(intro[0].contenttypeid) !== t.contentTypeId) {
      throw new HardStop("contentTypeId 불일치", `요청 ${t.contentId}/${t.contentTypeId}, 응답 ${intro[0].contentid}/${intro[0].contenttypeid}`);
    }
    introSuccess++;

    const c = common[0];

    // ── 지역 매핑 검증 (areaCode+sigunguCode+지역명 결합, sigunguCode 단독 판단 금지) ──
    const regionCheck = validateRegionMapping(
      { areaCode: String(c.areacode ?? ""), sigunguCode: c.sigungucode != null && c.sigungucode !== "" ? String(c.sigungucode) : null },
      { areaCode: t.expectedAreaCode, sigunguCode: t.expectedSigunguCode }
    );
    if (!regionCheck.ok) {
      warnings.invalidRegion++;
      throw new HardStop(regionCheck.error === "LEGACY_JEJU_SIGUNGU" ? "제주 코드 오류" : "지역 매핑 오류", `contentId=${t.contentId}: ${regionCheck.error}`);
    }

    // ── homepage/tel/overview/modifiedAt 정제 ──
    const homepage = normalizeHomepage(c.homepage);
    if (homepage.changed) warnings.homepageHtmlNormalized++;
    if (homepage.warning) warnings.homepageInvalid++;

    const tel = normalizeTel(c.tel);
    if (tel.value === null) warnings.emptyTel++;

    const overview = normalizeOverview(c.overview);

    const modifiedAt = parseExternalModifiedAt(c.modifiedtime);
    if (modifiedAt.warning) warnings.invalidModifiedAt++;

    const detailData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(intro[0])) {
      if (k === "contentid" || k === "contenttypeid") continue;
      detailData[k] = v;
    }

    let txResult: any[];
    try {
      txResult = await sql.transaction([
        sql`
          UPDATE places SET
            overview = COALESCE(NULLIF(${overview ?? ""}, ''), overview),
            homepage = COALESCE(NULLIF(${homepage.value ?? ""}, ''), homepage),
            tel = COALESCE(NULLIF(${tel.value ?? ""}, ''), tel),
            external_modified_at = CASE
              WHEN ${modifiedAt.value}::timestamptz IS NOT NULL
               AND (external_modified_at IS NULL OR ${modifiedAt.value}::timestamptz > external_modified_at)
              THEN ${modifiedAt.value}::timestamptz
              ELSE external_modified_at
            END,
            updated_at = now()
          WHERE external_source = 'tour_api' AND external_content_id = ${t.contentId}
          RETURNING id, overview, homepage, tel, external_modified_at
        `,
        sql`
          INSERT INTO place_tourism_details (place_id, content_type_id, detail_data, source)
          VALUES (${p.placeId}, ${t.contentTypeId}, ${JSON.stringify(detailData)}::jsonb, 'tour_api')
          RETURNING id
        `,
      ]);
    } catch (e) {
      throw new HardStop("DB 오류", `place_id=${p.placeId} contentId=${t.contentId} 트랜잭션 실패: ${e}`);
    }

    const [updateRows, insertRows] = txResult as [any[], any[]];
    if (updateRows.length !== 1 || updateRows[0].id !== p.placeId) {
      throw new HardStop("places UPDATE 대상 불일치", `contentId=${t.contentId}: ${updateRows.length}건, id=${updateRows[0]?.id}`);
    }
    if (insertRows.length !== 1) {
      throw new HardStop("place_tourism_details INSERT 실패", `contentId=${t.contentId}: ${insertRows.length}건`);
    }
    updateSuccess++;
    insertSuccess++;
    console.log(`  OK — homepage=${homepage.changed ? "정제됨" : "그대로"} tel=${tel.value ? "있음" : "없음"} overview=${overview ? "있음" : "없음"} detail 필드 ${Object.keys(detailData).length}개`);
  }

  // ══════════════════════════ 실행 후 검증 ══════════════════════════
  console.log("\n=== 실행 후 검증 ===");
  const dupCheck = await sql`
    select place_id, content_type_id, count(*) as cnt
    from place_tourism_details group by place_id, content_type_id having count(*) > 1
  `;
  const fkCheck = await sql`
    select count(*) as c from place_tourism_details ptd left join places p on p.id = ptd.place_id where p.id is null
  `;
  const protectedCounts = await sql`
    select
      (select count(*) from itineraries) as itineraries,
      (select count(*) from reviews) as reviews,
      (select count(*) from regions) as regions,
      (select count(*) from places) as places,
      (select count(*) from place_tourism_details) as place_tourism_details
  `;

  console.log("\n=== PHASE 3-I COMPLETE ===");
  console.log(`API: detailCommon2 ${commonSuccess}/${TEST_TARGETS.length}, detailIntro2 ${introSuccess}/${TEST_TARGETS.length}, 총 ${apiCallCount}/${TEST_TARGETS.length * 2}`);
  console.log(`places UPDATE: ${updateSuccess}/${TEST_TARGETS.length}`);
  console.log(`place_tourism_details INSERT: ${insertSuccess}/${TEST_TARGETS.length}`);
  console.log(`UNIQUE 중복: ${dupCheck.length}, FK 오류: ${(fkCheck as any)[0].c}`);
  console.log("품질 warning 집계:", warnings);
  console.log("기존 데이터:", protectedCounts[0]);
}

main().catch((error) => {
  console.error("\n중단됨:", error?.message ?? error);
  process.exit(1);
});
