/**
 * PHASE 3-G-2 — TourAPI 상세정보(detailCommon2/detailIntro2) 소량 실반영 (INSERT/UPDATE 있음,
 * 최대 7건, 숙박 제외).
 *
 * 실행: dotenv -e .env.local -- tsx scripts/test-phase3g-tourapi-detail-apply.ts
 *
 * 허용된 DB 변경은 오직 두 가지뿐이다:
 *   ① places UPDATE — homepage/tel/overview/externalModifiedAt만, 사전에 확정된 7개
 *      contentId에 한해, COALESCE(NULLIF(new,''), old)로 기존 값을 보호.
 *   ② place_tourism_details INSERT — 같은 7건, (place_id, content_type_id) 사전 중복
 *      확인 후에만.
 * 그 외 어떤 테이블도 이 스크립트는 참조조차 하지 않는다.
 *
 * UPDATE+INSERT는 Neon HTTP 드라이버의 sql.transaction()으로 place당 원자적으로 묶는다
 * (drizzle-orm의 neon-http 어댑터는 db.transaction()을 지원하지 않아 — "No transactions
 * support in neon-http driver" — neon() 클라이언트의 저수준 batch transaction API를 직접
 * 쓴다). UPDATE 대상은 (external_source, external_content_id) UNIQUE 제약이 이미 있어
 * 구조적으로 0건 또는 1건만 매칭될 수 있다 — "2건 이상 매칭"은 DB 제약상 애초에 불가능하다.
 */
export {};

import { neon } from "@neondatabase/serverless";

const SERVICE_KEY = process.env.TOUR_API_SERVICE_KEY;
const BASE_URL = process.env.TOUR_API_BASE_URL ?? "https://apis.data.go.kr/B551011/KorService2";

if (!SERVICE_KEY) {
  console.error("중단: TOUR_API_SERVICE_KEY가 설정되어 있지 않습니다.");
  process.exit(1);
}

// PHASE 3-G-1 PREVIEW에서 확정한 7건 그대로. 숙박(32)은 제외 — 새 place를 만들지 않는다.
const TEST_TARGETS = [
  { regionCode: "KR-SEOUL-CITY", regionNameKo: "서울", contentTypeId: "12", contentTypeNameKo: "관광지", contentId: "1116925" },
  { regionCode: "KR-SEOUL-CITY", regionNameKo: "서울", contentTypeId: "14", contentTypeNameKo: "문화시설", contentId: "1750737" },
  { regionCode: "KR-JEJU-JEJUSI", regionNameKo: "제주시", contentTypeId: "12", contentTypeNameKo: "관광지", contentId: "1884521" },
  { regionCode: "KR-JEJU-JEJUSI", regionNameKo: "제주시", contentTypeId: "14", contentTypeNameKo: "문화시설", contentId: "2752772" },
  { regionCode: "KR-JEJU-JEJUSI", regionNameKo: "제주시", contentTypeId: "39", contentTypeNameKo: "음식점", contentId: "2837181" },
  { regionCode: "KR-JEJU-SEOGWIPO", regionNameKo: "서귀포시", contentTypeId: "12", contentTypeNameKo: "관광지", contentId: "1889833" },
  { regionCode: "KR-JEJU-SEOGWIPO", regionNameKo: "서귀포시", contentTypeId: "14", contentTypeNameKo: "문화시설", contentId: "130723" },
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

function parseExternalModifiedAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || !/^\d{14}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const second = Number(raw.slice(12, 14));
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

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
  }
  const preChecked: PreCheckRow[] = [];
  const preCheckErrors: string[] = [];

  for (const t of TEST_TARGETS) {
    const rows = await sql`
      select id, tel, homepage, overview, external_modified_at
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
    });
  }

  console.log("=== PHASE 3-G-2 PRE-RUN CHECK ===");
  console.log(`- 대상 place: ${TEST_TARGETS.length}`);
  console.log(`- detailCommon2 예상 호출: ${TEST_TARGETS.length}`);
  console.log(`- detailIntro2 예상 호출: ${TEST_TARGETS.length}`);
  console.log(`- 최대 API 호출: ${TEST_TARGETS.length * 2}`);
  console.log(`- 예상 places UPDATE: 최대 ${TEST_TARGETS.length}`);
  console.log(`- 예상 detail INSERT: 최대 ${TEST_TARGETS.length}`);
  console.log(`- 기존 detail row: ${existingDetailRows}`);
  console.log(`- 숙박 테스트: 제외`);
  console.log("\n대상 상세:");
  for (const p of preChecked) {
    console.log(
      `  [${p.target.regionNameKo}/${p.target.contentTypeNameKo}] contentId=${p.target.contentId} placeId=${p.placeId} 현재 tel="${p.currentTel}" homepage="${p.currentHomepage}" overview=${p.currentOverview ? "있음" : "NULL"} externalModifiedAt=${p.currentModifiedAt}`
    );
  }
  if (preCheckErrors.length > 0) {
    console.log("\n사전 확인 오류:");
    preCheckErrors.forEach((e) => console.log(`  ${e}`));
    throw new HardStop("사전 확인 실패", `${preCheckErrors.length}건의 오류 — 실행 중단, API 호출 0회`);
  }
  if (existingDetailRows > 0) {
    throw new HardStop("기존 detail 데이터 발견", `place_tourism_details에 이미 ${existingDetailRows}건 존재 — 실행 중단`);
  }
  console.log("\n이상 없음 — 실행 시작\n");

  // ══════════════════════════ 실제 실행 ══════════════════════════
  let commonSuccess = 0;
  let introSuccess = 0;
  let apiCallCount = 0;
  let apiErrorCount = 0;
  let updateSuccess = 0;
  let insertSuccess = 0;

  const quality: { target: (typeof TEST_TARGETS)[number]; overviewSaved: boolean; homepageSaved: boolean; telSaved: boolean; modifiedAtSaved: boolean; detailFieldCount: number }[] = [];

  for (const p of preChecked) {
    const t = p.target;
    console.log(`--- ${t.regionNameKo}/${t.contentTypeNameKo} contentId=${t.contentId} ---`);

    apiCallCount++;
    if (apiCallCount > TEST_TARGETS.length * 2) {
      throw new HardStop("예상보다 많은 API 호출", `누적 ${apiCallCount}회 — 최대 ${TEST_TARGETS.length * 2}회 초과`);
    }
    let common: any[];
    try {
      common = await callApi("detailCommon2", { contentId: t.contentId });
    } catch (e) {
      apiErrorCount++;
      throw e; // 임의 재시도하지 않고 즉시 중단
    }
    if (common.length !== 1) throw new HardStop("API 응답 구조 이상", `detailCommon2 contentId=${t.contentId} 응답 ${common.length}건 (기대값 1건)`);
    if (String(common[0].contentid) !== t.contentId) {
      throw new HardStop("contentId 매칭 실패", `요청=${t.contentId}, 응답=${common[0].contentid}`);
    }
    commonSuccess++;

    apiCallCount++;
    if (apiCallCount > TEST_TARGETS.length * 2) {
      throw new HardStop("예상보다 많은 API 호출", `누적 ${apiCallCount}회 — 최대 ${TEST_TARGETS.length * 2}회 초과`);
    }
    let intro: any[];
    try {
      intro = await callApi("detailIntro2", { contentId: t.contentId, contentTypeId: t.contentTypeId });
    } catch (e) {
      apiErrorCount++;
      throw e;
    }
    if (intro.length !== 1) throw new HardStop("API 응답 구조 이상", `detailIntro2 contentId=${t.contentId} 응답 ${intro.length}건 (기대값 1건)`);
    if (String(intro[0].contentid) !== t.contentId || String(intro[0].contenttypeid) !== t.contentTypeId) {
      throw new HardStop("contentTypeId 불일치", `요청 contentId=${t.contentId}/contentTypeId=${t.contentTypeId}, 응답 contentid=${intro[0].contentid}/contenttypeid=${intro[0].contenttypeid}`);
    }
    introSuccess++;

    const c = common[0];
    const newOverview: string = c.overview ?? "";
    const newHomepage: string = c.homepage ?? "";
    const newTel: string = c.tel ?? "";
    const newModifiedAt = parseExternalModifiedAt(c.modifiedtime);

    const detailData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(intro[0])) {
      if (k === "contentid" || k === "contenttypeid") continue;
      detailData[k] = v;
    }

    // place_id/name/address/lat/lng/category/externalAreaCode/externalSigunguCode는 이번
    // UPDATE 문에 아예 포함하지 않는다(Phase 3-F §5.3 설계 원칙 — 사실 필드는 손대지 않음).
    let txResult: any[];
    try {
      txResult = await sql.transaction([
        sql`
          UPDATE places SET
            overview = COALESCE(NULLIF(${newOverview}, ''), overview),
            homepage = COALESCE(NULLIF(${newHomepage}, ''), homepage),
            tel = COALESCE(NULLIF(${newTel}, ''), tel),
            external_modified_at = CASE
              WHEN ${newModifiedAt}::timestamptz IS NOT NULL
               AND (external_modified_at IS NULL OR ${newModifiedAt}::timestamptz > external_modified_at)
              THEN ${newModifiedAt}::timestamptz
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
    if (updateRows.length !== 1) {
      throw new HardStop("예상보다 많은/적은 UPDATE", `contentId=${t.contentId}: UPDATE된 행 ${updateRows.length}건 (기대값 1건)`);
    }
    if (updateRows[0].id !== p.placeId) {
      throw new HardStop("UPDATE 대상 불일치", `기대 placeId=${p.placeId}, 실제 UPDATE된 id=${updateRows[0].id}`);
    }
    if (insertRows.length !== 1) {
      throw new HardStop("예상보다 많은/적은 INSERT", `contentId=${t.contentId}: INSERT된 행 ${insertRows.length}건 (기대값 1건)`);
    }
    updateSuccess++;
    insertSuccess++;

    const updated = updateRows[0];
    quality.push({
      target: t,
      overviewSaved: !!updated.overview,
      homepageSaved: !!updated.homepage,
      telSaved: !!updated.tel,
      modifiedAtSaved: !!updated.external_modified_at,
      detailFieldCount: Object.keys(detailData).length,
    });
    console.log(`  OK — places 업데이트 1건, place_tourism_details 삽입 1건 (detail 필드 ${Object.keys(detailData).length}개)`);
  }

  // ══════════════════════════ 실행 후 검증 (읽기 전용) ══════════════════════════
  console.log("\n=== 실행 후 검증 ===");

  const dupCheck = await sql`
    select place_id, content_type_id, count(*) as cnt
    from place_tourism_details group by place_id, content_type_id having count(*) > 1
  `;
  console.log(`UNIQUE 중복(place_id, content_type_id): ${dupCheck.length}건 (기대값 0)`);

  const fkCheck = await sql`
    select count(*) as c from place_tourism_details ptd
    left join places p on p.id = ptd.place_id
    where p.id is null
  `;
  console.log(`FK 무결성 위반(고아 place_id): ${(fkCheck as any)[0].c}건 (기대값 0)`);

  const protectedCounts = await sql`
    select
      (select count(*) from itineraries) as itineraries,
      (select count(*) from reviews) as reviews,
      (select count(*) from regions) as regions,
      (select count(*) from places) as places,
      (select count(*) from sources) as sources,
      (select count(*) from videos) as videos,
      (select count(*) from video_knowledge) as video_knowledge,
      (select count(*) from search_log) as search_log,
      (select count(*) from excluded_video) as excluded_video,
      (select count(*) from source_cache) as source_cache,
      (select count(*) from search_locks) as search_locks,
      (select count(*) from api_rate_limits) as api_rate_limits,
      (select count(*) from content_moderation) as content_moderation,
      (select count(*) from trip_tips_cache) as trip_tips_cache,
      (select count(*) from blog_contents) as blog_contents,
      (select count(*) from content_jobs) as content_jobs,
      (select count(*) from shorts_contents) as shorts_contents,
      (select count(*) from tour_place_cache) as tour_place_cache,
      (select count(*) from travel_content_briefs) as travel_content_briefs,
      (select count(*) from youtube_contents) as youtube_contents,
      (select count(*) from place_tourism_details) as place_tourism_details
  `;
  console.log("보호 대상 테이블 row count:", protectedCounts[0]);

  // ══════════════════════════ 최종 보고 ══════════════════════════
  console.log("\n\n=== PHASE 3-G-2 COMPLETE ===\n");
  console.log("API:");
  console.log(`- detailCommon2: ${commonSuccess}/${TEST_TARGETS.length} 성공`);
  console.log(`- detailIntro2: ${introSuccess}/${TEST_TARGETS.length} 성공`);
  console.log(`- 총 API 호출: ${apiCallCount}/${TEST_TARGETS.length * 2}`);
  console.log(`- 오류: ${apiErrorCount}`);
  console.log("\nplaces:");
  console.log(`- UPDATE 대상: ${TEST_TARGETS.length}`);
  console.log(`- UPDATE 성공: ${updateSuccess}`);
  console.log("\nplace_tourism_details:");
  console.log(`- INSERT 대상: ${TEST_TARGETS.length}`);
  console.log(`- INSERT 성공: ${insertSuccess}`);
  console.log(`- 중복: ${dupCheck.length}`);
  console.log("\n데이터 품질:");
  console.log(`- overview: ${quality.filter((q) => q.overviewSaved).length}/${TEST_TARGETS.length}`);
  console.log(`- homepage: ${quality.filter((q) => q.homepageSaved).length}/${TEST_TARGETS.length}`);
  console.log(`- tel: ${quality.filter((q) => q.telSaved).length}/${TEST_TARGETS.length}`);
  console.log(`- externalModifiedAt: ${quality.filter((q) => q.modifiedAtSaved).length}/${TEST_TARGETS.length}`);
  console.log("\n무결성:");
  console.log(`- FK 오류: ${(fkCheck as any)[0].c}`);
  console.log(`- UNIQUE 중복: ${dupCheck.length}`);
  console.log(`- contentId 매칭 오류: 0`);
  console.log("\n기존 데이터:");
  const pc = protectedCounts[0] as any;
  console.log(`- itineraries: ${pc.itineraries}`);
  console.log(`- reviews: ${pc.reviews}`);
  console.log(`- regions: ${pc.regions}`);
  console.log(`- places: 실행 전 120 → 실행 후 ${pc.places}`);
  console.log(`- place_tourism_details: ${pc.place_tourism_details}`);
}

main().catch((error) => {
  console.error("\n중단됨:", error?.message ?? error);
  process.exit(1);
});
