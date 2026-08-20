/**
 * PHASE 3-J-5 — 잔여 12건 상세정보 배치 반영 (INSERT/UPDATE 있음, 음식점/숙박 없음).
 * TourAPI tour_api 출처 place 중 미보유 detail의 마지막 잔여분 — 이번 배치로 전량 완료.
 *
 * 실행: dotenv -e .env.local -- tsx scripts/test-phase3j5-batch12-apply.ts
 *
 * scripts/test-phase3j4-batch25-apply.ts와 골격 동일 — place 단위 실패 격리
 * (detailCommon2/detailIntro2 독립 시도), place당 정확히 1건만 UPDATE 대상
 * (UNIQUE(external_source, external_content_id)로 구조적 보장).
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

// PHASE 3-J-5 PREVIEW에서 재확인한 잔여 12건 그대로 (2026-08-20 SELECT 기준).
// 숙박(32) 0건, 음식점(39) 0건 — 이번 배치도 관광지(12)/문화시설(14)뿐.
const TEST_TARGETS = [
  { regionCode: "KR-JEJU-SEOGWIPO", regionNameKo: "서귀포시", expectedAreaCode: "39", expectedSigunguCode: "3" as string | null, contentTypeId: "12", contentId: "2781394", name: "구두미포구" },
  { regionCode: "KR-JEJU-SEOGWIPO", regionNameKo: "서귀포시", expectedAreaCode: "39", expectedSigunguCode: "3" as string | null, contentTypeId: "12", contentId: "128795", name: "남원 큰엉해안" },
  { regionCode: "KR-JEJU-SEOGWIPO", regionNameKo: "서귀포시", expectedAreaCode: "39", expectedSigunguCode: "3" as string | null, contentTypeId: "14", contentId: "130180", name: "아프리카 박물관" },
  { regionCode: "KR-JEJU-SEOGWIPO", regionNameKo: "서귀포시", expectedAreaCode: "39", expectedSigunguCode: "3" as string | null, contentTypeId: "14", contentId: "2406460", name: "제주 추사관" },
  { regionCode: "KR-JEJU-SEOGWIPO", regionNameKo: "서귀포시", expectedAreaCode: "39", expectedSigunguCode: "3" as string | null, contentTypeId: "14", contentId: "526666", name: "제주유리박물관" },
  { regionCode: "KR-SEOUL-CITY", regionNameKo: "서울", expectedAreaCode: "1", expectedSigunguCode: null as string | null, contentTypeId: "12", contentId: "1604824", name: "경희궁공원" },
  { regionCode: "KR-SEOUL-CITY", regionNameKo: "서울", expectedAreaCode: "1", expectedSigunguCode: null as string | null, contentTypeId: "12", contentId: "2591799", name: "고척동 고인돌" },
  { regionCode: "KR-SEOUL-CITY", regionNameKo: "서울", expectedAreaCode: "1", expectedSigunguCode: null as string | null, contentTypeId: "14", contentId: "2606224", name: "공평도시유적전시관" },
  { regionCode: "KR-SEOUL-CITY", regionNameKo: "서울", expectedAreaCode: "1", expectedSigunguCode: null as string | null, contentTypeId: "14", contentId: "130212", name: "관악문화원" },
  { regionCode: "KR-JEJU-JEJUSI", regionNameKo: "제주시", expectedAreaCode: "39", expectedSigunguCode: "4" as string | null, contentTypeId: "12", contentId: "127860", name: "금능석물원" },
  { regionCode: "KR-JEJU-JEJUSI", regionNameKo: "제주시", expectedAreaCode: "39", expectedSigunguCode: "4" as string | null, contentTypeId: "12", contentId: "2027184", name: "금룡사(제주)" },
  { regionCode: "KR-JEJU-JEJUSI", regionNameKo: "제주시", expectedAreaCode: "39", expectedSigunguCode: "4" as string | null, contentTypeId: "14", contentId: "130745", name: "제주통일관" },
] as const;

function buildUrl(path: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${BASE_URL}/${path}?serviceKey=${SERVICE_KEY}&${query}`;
}

async function callApi(path: string, params: Record<string, string>): Promise<{ ok: true; items: any[] } | { ok: false; reason: string }> {
  const url = buildUrl(path, { MobileOS: "ETC", MobileApp: "TripTubeAI", _type: "json", ...params });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let text: string;
  try {
    const res = await fetch(url, { signal: controller.signal });
    text = await res.text();
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, reason: `네트워크 오류: ${e}` };
  } finally {
    clearTimeout(timeout);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: `JSON 파싱 실패: ${text.slice(0, 200)}` };
  }
  const header = json?.response?.header ?? json;
  if (header?.resultCode !== "0000" && header?.resultCode !== "00") {
    return { ok: false, reason: `resultCode=${header?.resultCode} resultMsg=${header?.resultMsg}` };
  }
  const rawItems = json?.response?.body?.items?.item;
  if (rawItems === "" || rawItems === undefined) return { ok: true, items: [] };
  return { ok: true, items: Array.isArray(rawItems) ? rawItems : [rawItems] };
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const warnings = createQualityWarningCounts();
  const MAX_API_CALLS = TEST_TARGETS.length * 2;

  let apiCallCount = 0;
  let commonSuccess = 0;
  let commonFailed = 0;
  let introSuccess = 0;
  let introFailed = 0;
  let updateAttempted = 0;
  let updateSuccess = 0;
  let updateFailed = 0;
  let insertAttempted = 0;
  let insertSuccess = 0;
  let insertFailed = 0;
  let insertSkippedExisting = 0;

  const failureLog: string[] = [];

  console.log("=== PHASE 3-J-5 실행 시작 (place 단위 실패 격리, 12건 최대 처리 — 마지막 잔여분) ===\n");

  for (const t of TEST_TARGETS) {
    console.log(`--- ${t.regionNameKo}/contentTypeId=${t.contentTypeId} contentId=${t.contentId} (${t.name}) ---`);

    const placeRows = await sql`
      select id, lat, lng from places where external_source = 'tour_api' and external_content_id = ${t.contentId}
    `;
    if (placeRows.length !== 1) {
      failureLog.push(`contentId=${t.contentId}: places 매칭 ${placeRows.length}건 — 스킵`);
      console.log(`  스킵: places 매칭 ${placeRows.length}건`);
      continue;
    }
    const place = placeRows[0] as any;
    const existingDetail = await sql`
      select id from place_tourism_details where place_id = ${place.id} and content_type_id = ${t.contentTypeId}
    `;
    const hasExistingDetail = existingDetail.length > 0;
    if (hasExistingDetail) {
      insertSkippedExisting++;
      console.log(`  주의: 기존 place_tourism_details 발견 — INSERT 스킵`);
    }

    if (apiCallCount + 2 > MAX_API_CALLS) {
      console.log("  중단: API 호출 예산 초과 위험 — 배치 종료");
      break;
    }

    apiCallCount++;
    const common = await callApi("detailCommon2", { contentId: t.contentId });
    let commonOk = false;
    let commonItem: any = null;
    if (!common.ok) {
      commonFailed++;
      failureLog.push(`contentId=${t.contentId}: detailCommon2 실패 — ${common.reason}`);
      console.log(`  detailCommon2 실패: ${common.reason}`);
    } else if (common.items.length !== 1 || String(common.items[0].contentid) !== t.contentId) {
      commonFailed++;
      failureLog.push(`contentId=${t.contentId}: detailCommon2 응답 불일치`);
      console.log(`  detailCommon2 실패: 응답 불일치`);
    } else {
      commonOk = true;
      commonItem = common.items[0];
      commonSuccess++;
    }

    apiCallCount++;
    const intro = await callApi("detailIntro2", { contentId: t.contentId, contentTypeId: t.contentTypeId });
    let introOk = false;
    let introItem: any = null;
    if (!intro.ok) {
      introFailed++;
      failureLog.push(`contentId=${t.contentId}: detailIntro2 실패 — ${intro.reason}`);
      console.log(`  detailIntro2 실패: ${intro.reason}`);
    } else if (intro.items.length !== 1 || String(intro.items[0].contentid) !== t.contentId || String(intro.items[0].contenttypeid) !== t.contentTypeId) {
      introFailed++;
      failureLog.push(`contentId=${t.contentId}: detailIntro2 응답 불일치`);
      console.log(`  detailIntro2 실패: 응답 불일치`);
    } else {
      introOk = true;
      introItem = intro.items[0];
      introSuccess++;
    }

    if (commonOk) {
      const regionCheck = validateRegionMapping(
        { areaCode: String(commonItem.areacode ?? ""), sigunguCode: commonItem.sigungucode != null && commonItem.sigungucode !== "" ? String(commonItem.sigungucode) : null },
        { areaCode: t.expectedAreaCode, sigunguCode: t.expectedSigunguCode }
      );
      if (!regionCheck.ok) {
        warnings.invalidRegion++;
        failureLog.push(`contentId=${t.contentId}: 지역 매핑 오류(${regionCheck.error}) — places UPDATE 스킵`);
        console.log(`  지역 매핑 오류(${regionCheck.error}) — places UPDATE 스킵`);
      } else {
        const coordCheck = validateCoordinate(place.lat, place.lng);
        if (coordCheck.warnings.length > 0) {
          warnings.invalidCoordinate++;
          console.log(`  좌표 경고: ${coordCheck.warnings.join(",")} (lat=${place.lat}, lng=${place.lng}) — 좌표는 수정하지 않음`);
        }

        const homepage = normalizeHomepage(commonItem.homepage);
        if (homepage.changed) warnings.homepageHtmlNormalized++;
        if (homepage.warning) warnings.homepageInvalid++;

        const tel = normalizeTel(commonItem.tel);
        if (tel.value === null) warnings.emptyTel++;

        const overview = normalizeOverview(commonItem.overview);
        const modifiedAt = parseExternalModifiedAt(commonItem.modifiedtime);
        if (modifiedAt.warning) warnings.invalidModifiedAt++;

        updateAttempted++;
        try {
          const updateRows = await sql`
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
            RETURNING id
          `;
          if (updateRows.length === 1 && (updateRows[0] as any).id === place.id) {
            updateSuccess++;
            console.log(`  places UPDATE 성공 (homepage=${homepage.changed ? "정제됨" : homepage.value ? "그대로" : "없음"}, tel=${tel.value ? "있음" : "없음"})`);
          } else {
            updateFailed++;
            failureLog.push(`contentId=${t.contentId}: UPDATE 대상 불일치(${updateRows.length}건)`);
            console.log(`  places UPDATE 실패: 대상 불일치`);
          }
        } catch (e) {
          updateFailed++;
          failureLog.push(`contentId=${t.contentId}: UPDATE DB 오류 — ${e}`);
          console.log(`  places UPDATE 실패: DB 오류 ${e}`);
        }
      }
    } else {
      console.log(`  places UPDATE 스킵(detailCommon2 실패)`);
    }

    if (introOk && !hasExistingDetail) {
      const detailData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(introItem)) {
        if (k === "contentid" || k === "contenttypeid") continue;
        detailData[k] = v;
      }
      insertAttempted++;
      try {
        const insertRows = await sql`
          INSERT INTO place_tourism_details (place_id, content_type_id, detail_data, source)
          VALUES (${place.id}, ${t.contentTypeId}, ${JSON.stringify(detailData)}::jsonb, 'tour_api')
          RETURNING id
        `;
        if (insertRows.length === 1) {
          insertSuccess++;
          console.log(`  place_tourism_details INSERT 성공 (필드 ${Object.keys(detailData).length}개)`);
        } else {
          insertFailed++;
          failureLog.push(`contentId=${t.contentId}: INSERT 결과 이상`);
          console.log(`  place_tourism_details INSERT 실패: 결과 이상`);
        }
      } catch (e) {
        insertFailed++;
        failureLog.push(`contentId=${t.contentId}: INSERT DB 오류(FK/UNIQUE 등) — ${e}`);
        console.log(`  place_tourism_details INSERT 실패: ${e}`);
      }
    } else if (!introOk) {
      console.log(`  place_tourism_details INSERT 스킵(detailIntro2 실패)`);
    } else if (hasExistingDetail) {
      console.log(`  place_tourism_details INSERT 스킵(기존 데이터 존재)`);
    }
  }

  console.log("\n=== 실행 후 검증 ===");
  const dupCheck = await sql`
    select place_id, content_type_id, count(*) as cnt
    from place_tourism_details group by place_id, content_type_id having count(*) > 1
  `;
  const fkCheck = await sql`
    select count(*) as c from place_tourism_details ptd left join places p on p.id = ptd.place_id where p.id is null
  `;

  console.log("\n=== PHASE 3-J-5 COMPLETE ===");
  console.log(`API 호출: 계획 ${MAX_API_CALLS} / 실제 ${apiCallCount}`);
  console.log(`detailCommon2: 성공 ${commonSuccess} / 실패 ${commonFailed}`);
  console.log(`detailIntro2: 성공 ${introSuccess} / 실패 ${introFailed}`);
  console.log(`places UPDATE: 시도 ${updateAttempted} / 성공 ${updateSuccess} / 실패 ${updateFailed}`);
  console.log(`place_tourism_details INSERT: 시도 ${insertAttempted} / 성공 ${insertSuccess} / 실패 ${insertFailed} / 기존발견스킵 ${insertSkippedExisting}`);
  console.log("품질 warning 집계:", warnings);
  console.log(`UNIQUE 중복: ${dupCheck.length}, FK 오류: ${(fkCheck as any)[0].c}`);
  if (failureLog.length > 0) {
    console.log("\n실패/스킵 상세 로그:");
    failureLog.forEach((f) => console.log(`  - ${f}`));
  }
}

main().catch((error) => {
  console.error("\n예상치 못한 스크립트 레벨 오류:", error?.message ?? error);
  process.exit(1);
});
