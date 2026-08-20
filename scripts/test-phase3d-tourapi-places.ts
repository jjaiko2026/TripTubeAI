/**
 * PHASE 3-D — TourAPI → places 소량 수집 검증 (INSERT 있음, 지역당 최대 20건, 총 최대 60건).
 *
 * 실행: dotenv -e .env.local -- tsx scripts/test-phase3d-tourapi-places.ts
 *
 * 목적: "대량 수집"이 아니라 TourAPI → places 파이프라인(매핑/UNIQUE 중복 처리/지역 매핑/
 * 데이터 품질)이 정확히 동작하는지 검증하는 것. 여행지식DB 사용자 승인 스펙(PHASE 3-D)을
 * 그대로 따른다 — areaBasedList2만 사용, 4개 콘텐츠유형만, 지역당 상한 20건.
 *
 * 이번 스크립트는 places 테이블에만 INSERT한다(신규 행만, 기존 행 UPDATE 없음 —
 * onConflictDoNothing). 다른 테이블은 전혀 건드리지 않는다.
 */
export {}; // 독립 모듈 스코프

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { places, regions } from "@/db/schema";

const SERVICE_KEY = process.env.TOUR_API_SERVICE_KEY;
const BASE_URL = process.env.TOUR_API_BASE_URL ?? "https://apis.data.go.kr/B551011/KorService2";

if (!SERVICE_KEY) {
  console.error("중단: TOUR_API_SERVICE_KEY가 설정되어 있지 않습니다.");
  process.exit(1);
}

// ── §1 테스트 지역 (사용자 승인 스펙 그대로, 제주 sigunguCode 1/2는 코드 어디에도 존재하지 않음) ──
const TEST_TARGETS = [
  { regionCode: "KR-SEOUL-CITY", nameKo: "서울", areaCode: "1", sigunguCode: null as string | null },
  { regionCode: "KR-JEJU-JEJUSI", nameKo: "제주시", areaCode: "39", sigunguCode: "4" },
  { regionCode: "KR-JEJU-SEOGWIPO", nameKo: "서귀포시", areaCode: "39", sigunguCode: "3" },
] as const;

// ── §3 콘텐츠 유형 4개 + 내부 category 매핑 (§5 매핑표 전체 중 이번에 쓰는 4개만) ──
const CONTENT_TYPES = [
  { id: "12", nameKo: "관광지", internal: "tourism" },
  { id: "14", nameKo: "문화시설", internal: "tourism" },
  { id: "39", nameKo: "음식점", internal: "food" },
  { id: "32", nameKo: "숙박", internal: "accommodation" },
] as const;

const MAX_PER_REGION = 20;

function buildUrl(params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${BASE_URL}/areaBasedList2?serviceKey=${SERVICE_KEY}&${query}`;
}

class HardStop extends Error {
  constructor(reason: string, detail: unknown) {
    super(`[HARD STOP: ${reason}] ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
}

async function callAreaBasedList(params: {
  areaCode: string;
  sigunguCode: string | null;
  contentTypeId: string;
  numOfRows: number;
}): Promise<any[]> {
  const query: Record<string, string> = {
    numOfRows: String(params.numOfRows),
    pageNo: "1",
    MobileOS: "ETC",
    MobileApp: "TripTubeAI",
    _type: "json",
    areaCode: params.areaCode,
    contentTypeId: params.contentTypeId,
  };
  if (params.sigunguCode) query.sigunguCode = params.sigunguCode;

  const url = buildUrl(query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let text: string;
  try {
    const res = await fetch(url, { signal: controller.signal });
    text = await res.text();
    if (!res.ok) {
      throw new HardStop("API 응답 구조 예상과 다름 (HTTP 오류)", `HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timeout);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HardStop("API 응답 구조 예상과 다름 (JSON 파싱 실패)", text.slice(0, 300));
  }

  const header = json?.response?.header;
  if (header?.resultCode !== "0000" && header?.resultCode !== "00") {
    throw new HardStop("API 응답 구조 예상과 다름 (resultCode 비정상)", `resultCode=${header?.resultCode} resultMsg=${header?.resultMsg}`);
  }

  const rawItems = json?.response?.body?.items?.item;
  if (rawItems === "" || rawItems === undefined) return [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items;
}

/** TourAPI modifiedtime(YYYYMMDDHHmmss)을 안전하게 Date로 변환. 형식이 다르면 null. */
function parseExternalModifiedAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || !/^\d{14}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const second = Number(raw.slice(12, 14));
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // 유효하지 않은 날짜(예: 13월)면 Date가 다른 달로 넘어가므로 되짚어 검증한다.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

// 대한민국 대략적 위경도 범위(제주 포함). 이 범위를 벗어나면 "비정상 좌표"로 별도 집계한다.
function isAbnormalCoordinate(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null) return false; // null 자체는 별도 항목(N/A)에서 집계
  return !(33.0 <= lat && lat <= 39.0 && 124.5 <= lng && lng <= 132.0);
}

interface QualityFlags {
  nameNull: boolean;
  addressNull: boolean;
  latLngInvalid: boolean; // 파싱 불가(숫자 아님)
  latLngAbnormal: boolean; // 파싱은 되지만 대한민국 범위 밖
  contentIdNull: boolean;
  duplicateContentIdInBatch: boolean;
  wrongJejuCode: boolean; // 요청한 sigunguCode/areaCode와 응답 값이 다름
}

interface MappedRow {
  target: (typeof TEST_TARGETS)[number];
  contentType: (typeof CONTENT_TYPES)[number];
  raw: any;
  values: typeof places.$inferInsert;
  flags: QualityFlags;
}

async function main() {
  const db = getDb();

  // ── §13 실행 전 보고 ──
  console.log("=== PHASE 3-D 실행 전 보고 ===\n");
  console.log("1) 테스트 지역 3개:");
  for (const t of TEST_TARGETS) {
    console.log(`   - ${t.nameKo} (${t.regionCode}) areaCode=${t.areaCode} sigunguCode=${t.sigunguCode ?? "(없음)"}`);
  }
  console.log("\n2) 콘텐츠 유형 4개:");
  for (const c of CONTENT_TYPES) console.log(`   - ${c.id} ${c.nameKo} → internal category "${c.internal}"`);
  console.log(`\n3) 지역별 최대 수집량: 지역당 최대 ${MAX_PER_REGION}건, 총 최대 ${MAX_PER_REGION * TEST_TARGETS.length}건`);
  console.log(`4) 예상 API 호출 횟수: 최대 ${TEST_TARGETS.length * CONTENT_TYPES.length}회 (지역 ${TEST_TARGETS.length} × 유형 ${CONTENT_TYPES.length}, 지역별 20건 예산 소진 시 그 지역의 남은 유형 호출은 생략)`);
  console.log(`5) 예상 최대 INSERT 수: 최대 ${MAX_PER_REGION * TEST_TARGETS.length}건 (실제로는 UNIQUE 중복 시 스킵되어 이보다 적을 수 있음)`);
  console.log(`6) 중복 처리 방식: UNIQUE(external_source, external_content_id) + onConflictDoNothing — 이미 있는 contentId는 UPDATE 없이 스킵, 신규만 INSERT`);
  console.log("7) 기존 DB 보호 대상 (이번 스크립트가 절대 건드리지 않음):");
  for (const t of ["itineraries", "reviews", "blog_contents", "content_jobs", "shorts_contents", "tour_place_cache", "travel_content_briefs", "youtube_contents", "source_cache", "search_locks", "api_rate_limits", "content_moderation", "trip_tips_cache", "videos(기존 행)", "sources(기존 행)"]) {
    console.log(`   - ${t}`);
  }
  console.log("\n=== 계획 확인 완료, 실행 시작 ===\n");

  // ── 지역 존재 확인 (읽기 전용) ──
  const regionRows: Record<string, { id: string }> = {};
  for (const t of TEST_TARGETS) {
    const [r] = await db.select().from(regions).where(eq(regions.code, t.regionCode)).limit(1);
    if (!r) throw new HardStop("지역 매핑 오류", `regions 테이블에 ${t.regionCode}가 존재하지 않음`);
    regionRows[t.regionCode] = { id: r.id };
  }

  const report: {
    regionNameKo: string;
    contentTypeNameKo: string;
    apiCalls: number;
    responseCount: number;
    savedCount: number;
    duplicateCount: number;
    errorCount: number;
  }[] = [];

  let totalApiCalls = 0;
  const qualityTotals = {
    nameNull: 0,
    addressNull: 0,
    latLngInvalid: 0,
    latLngAbnormal: 0,
    contentIdNull: 0,
    duplicateContentIdInBatch: 0,
    wrongJejuCode: 0,
  };

  for (const target of TEST_TARGETS) {
    let remaining = MAX_PER_REGION;
    const seenContentIdsThisRegion = new Set<string>();

    for (const contentType of CONTENT_TYPES) {
      if (remaining <= 0) {
        report.push({
          regionNameKo: target.nameKo,
          contentTypeNameKo: contentType.nameKo,
          apiCalls: 0,
          responseCount: 0,
          savedCount: 0,
          duplicateCount: 0,
          errorCount: 0,
        });
        continue;
      }

      totalApiCalls++;
      if (totalApiCalls > TEST_TARGETS.length * CONTENT_TYPES.length) {
        throw new HardStop("예상보다 많은 API 호출", `누적 ${totalApiCalls}회 — 계획된 최대 ${TEST_TARGETS.length * CONTENT_TYPES.length}회 초과`);
      }

      const items = await callAreaBasedList({
        areaCode: target.areaCode,
        sigunguCode: target.sigunguCode,
        contentTypeId: contentType.id,
        numOfRows: remaining,
      });

      const candidates = items.slice(0, remaining);
      let savedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      for (const raw of candidates) {
        // ── §15 하드 스톱: 지역/제주 코드 검증 ──
        const returnedAreaCode = String(raw.areacode ?? "");
        const returnedSigunguCode = raw.sigungucode != null && raw.sigungucode !== "" ? String(raw.sigungucode) : null;
        if (returnedAreaCode !== target.areaCode) {
          throw new HardStop(
            "지역 매핑 오류",
            `요청 areaCode=${target.areaCode}, 응답 areacode=${returnedAreaCode} (contentid=${raw.contentid})`
          );
        }
        if (target.sigunguCode !== null) {
          if (returnedSigunguCode !== target.sigunguCode) {
            throw new HardStop(
              "지역 매핑 오류",
              `요청 sigunguCode=${target.sigunguCode}, 응답 sigungucode=${returnedSigunguCode} (contentid=${raw.contentid})`
            );
          }
          if (returnedSigunguCode === "1" || returnedSigunguCode === "2") {
            throw new HardStop(
              "제주 코드 오류",
              `폐지된 sigunguCode(${returnedSigunguCode})가 응답에 포함됨 — 남제주군/북제주군은 매핑 금지 (contentid=${raw.contentid})`
            );
          }
        }

        const contentId: string | null = raw.contentid ? String(raw.contentid) : null;
        const flags: QualityFlags = {
          nameNull: !raw.title,
          addressNull: !raw.addr1,
          latLngInvalid: false,
          latLngAbnormal: false,
          contentIdNull: !contentId,
          duplicateContentIdInBatch: contentId ? seenContentIdsThisRegion.has(contentId) : false,
          wrongJejuCode: false, // 이 시점까지 왔다면 하드 스톱 통과, 즉 정상
        };

        let lat: number | null = null;
        let lng: number | null = null;
        const latRaw = raw.mapy;
        const lngRaw = raw.mapx;
        if (latRaw !== undefined && latRaw !== null && latRaw !== "") {
          const n = Number(latRaw);
          if (Number.isFinite(n)) lat = n;
          else flags.latLngInvalid = true;
        }
        if (lngRaw !== undefined && lngRaw !== null && lngRaw !== "") {
          const n = Number(lngRaw);
          if (Number.isFinite(n)) lng = n;
          else flags.latLngInvalid = true;
        }
        if (!flags.latLngInvalid && isAbnormalCoordinate(lat, lng)) flags.latLngAbnormal = true;

        if (contentId) seenContentIdsThisRegion.add(contentId);
        if (flags.nameNull) qualityTotals.nameNull++;
        if (flags.addressNull) qualityTotals.addressNull++;
        if (flags.latLngInvalid) qualityTotals.latLngInvalid++;
        if (flags.latLngAbnormal) qualityTotals.latLngAbnormal++;
        if (flags.contentIdNull) qualityTotals.contentIdNull++;
        if (flags.duplicateContentIdInBatch) qualityTotals.duplicateContentIdInBatch++;

        if (!contentId) {
          // externalContentId는 UNIQUE 키의 절반이다 — null이면 중복 방지가 무의미해지므로
          // 이번 검증 저장 대상에서 제외하고 오류로 집계한다(§9 "조용히 버리지 않는다" — 카운트에 남김).
          errorCount++;
          continue;
        }

        const values: typeof places.$inferInsert = {
          regionId: regionRows[target.regionCode].id,
          name: raw.title ?? "",
          normalizedName: String(raw.title ?? "").trim().replace(/\s+/g, ""),
          category: contentType.internal,
          address: raw.addr1 || null,
          lat: lat !== null ? String(lat) : null,
          lng: lng !== null ? String(lng) : null,
          status: "review",
          externalSource: "tour_api",
          externalContentId: contentId,
          externalContentTypeId: raw.contenttypeid ? String(raw.contenttypeid) : null,
          categoryCode1: raw.cat1 || null,
          categoryCode2: raw.cat2 || null,
          categoryCode3: raw.cat3 || null,
          homepage: null, // areaBasedList2에는 없음(detailCommon2 전용, 이번 Phase 범위 밖)
          tel: raw.tel || null,
          overview: null, // 〃
          externalModifiedAt: parseExternalModifiedAt(raw.modifiedtime),
          externalAreaCode: returnedAreaCode,
          externalSigunguCode: returnedSigunguCode,
        };

        if (!values.name) {
          // name은 NOT NULL 컬럼 — title이 비어있으면 INSERT 자체가 DB constraint 위반을 일으킨다.
          // §15 "DB constraint 오류"에 해당하므로 시도 전에 하드 스톱한다.
          throw new HardStop("DB constraint 오류(NOT NULL: name)", `title 비어있음, contentid=${contentId}`);
        }

        try {
          const inserted = await db
            .insert(places)
            .values(values)
            .onConflictDoNothing({ target: [places.externalSource, places.externalContentId] })
            .returning({ id: places.id });
          if (inserted.length === 1) {
            savedCount++;
            remaining--;
          } else {
            duplicateCount++;
          }
        } catch (e) {
          throw new HardStop("DB constraint 오류", `INSERT 실패 contentid=${contentId}: ${e}`);
        }

        if (remaining <= 0) break; // 지역 예산 소진 — 이번 유형의 나머지 candidate도 더 처리하지 않음
      }

      report.push({
        regionNameKo: target.nameKo,
        contentTypeNameKo: contentType.nameKo,
        apiCalls: 1,
        responseCount: items.length,
        savedCount,
        duplicateCount,
        errorCount,
      });
    }
  }

  // ── §14 실행 후 보고 ──
  console.log("\n=== 실행 결과 표 ===");
  console.log("| 지역 | 콘텐츠 유형 | API 요청 | 응답 건수 | 저장 건수 | 중복 | 오류 |");
  console.log("|---|---|---:|---:|---:|---:|---:|");
  for (const r of report) {
    console.log(`| ${r.regionNameKo} | ${r.contentTypeNameKo} | ${r.apiCalls} | ${r.responseCount} | ${r.savedCount} | ${r.duplicateCount} | ${r.errorCount} |`);
  }

  const totals = report.reduce(
    (acc, r) => ({
      apiCalls: acc.apiCalls + r.apiCalls,
      responseCount: acc.responseCount + r.responseCount,
      savedCount: acc.savedCount + r.savedCount,
      duplicateCount: acc.duplicateCount + r.duplicateCount,
      errorCount: acc.errorCount + r.errorCount,
    }),
    { apiCalls: 0, responseCount: 0, savedCount: 0, duplicateCount: 0, errorCount: 0 }
  );
  console.log(`| 합계 |  | ${totals.apiCalls} | ${totals.responseCount} | ${totals.savedCount} | ${totals.duplicateCount} | ${totals.errorCount} |`);

  console.log("\n=== 데이터 품질 집계 (§9) ===");
  console.log(JSON.stringify(qualityTotals, null, 2));

  console.log("\n=== 최종 집계 ===");
  const [{ count: placesTotal }] = await db.select({ count: sql<number>`count(*)` }).from(places);
  console.log(`places 전체 row count: ${placesTotal}`);
}

main().catch((error) => {
  console.error("\n중단됨:", error?.message ?? error);
  process.exit(1);
});
