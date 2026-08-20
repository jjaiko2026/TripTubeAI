/**
 * PHASE 3-E — TourAPI detailCommon2/detailIntro2 소량 검증 (읽기 전용, DB 쓰기 없음).
 *
 * 실행: dotenv -e .env.local -- tsx scripts/test-phase3e-tourapi-detail.ts
 *
 * 목적: Phase 3-D에서 저장한 places(120건) 전체가 아니라, 콘텐츠유형(관광지/문화시설/
 * 음식점/숙박) 대표 소수만 뽑아 detailCommon2/detailIntro2 실제 응답이 현재 places
 * 스키마에 어떻게 매핑되는지 검증한다. places INSERT/UPDATE는 전혀 하지 않는다 —
 * SELECT(대표 선정)와 TourAPI GET 호출만 수행한다.
 *
 * 숙박(32)은 Phase 3-D에서 지역 예산이 관광지/문화시설/음식점으로 먼저 소진돼 저장된
 * place가 0건이다 — 그래서 숙박만 areaBasedList2를 표본 확보 목적으로 1회 추가 호출한다
 * (역시 places에 저장하지 않음, 표본 식별용).
 */
export {};

import { sql as drizzleSql } from "drizzle-orm";
import { getDb } from "@/db";
import { places } from "@/db/schema";

const SERVICE_KEY = process.env.TOUR_API_SERVICE_KEY;
const BASE_URL = process.env.TOUR_API_BASE_URL ?? "https://apis.data.go.kr/B551011/KorService2";

if (!SERVICE_KEY) {
  console.error("중단: TOUR_API_SERVICE_KEY가 설정되어 있지 않습니다.");
  process.exit(1);
}

const CONTENT_TYPES = [
  { id: "12", nameKo: "관광지" },
  { id: "14", nameKo: "문화시설" },
  { id: "39", nameKo: "음식점" },
  { id: "32", nameKo: "숙박" },
] as const;

const SAMPLES_PER_TYPE = 2;

function buildUrl(path: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `${BASE_URL}/${path}?serviceKey=${SERVICE_KEY}&${query}`;
}

async function callApi(path: string, params: Record<string, string>): Promise<any> {
  const url = buildUrl(path, { MobileOS: "ETC", MobileApp: "TripTubeAI", _type: "json", ...params });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      console.log(`  [오류] HTTP ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      console.log(`  [오류] JSON 파싱 실패: ${text.slice(0, 200)}`);
      return null;
    }
    // 정상 응답은 response.header 아래, 파라미터 오류 등은 최상위에 flat하게 온다(실측 확인) —
    // 둘 다 처리해야 오류 메시지가 "undefined"로 뭉개지지 않는다.
    const header = json?.response?.header ?? json;
    if (header?.resultCode !== "0000" && header?.resultCode !== "00") {
      console.log(`  [오류] resultCode=${header?.resultCode} resultMsg=${header?.resultMsg}`);
      return null;
    }
    const rawItems = json?.response?.body?.items?.item;
    if (rawItems === "" || rawItems === undefined) return [];
    return Array.isArray(rawItems) ? rawItems : [rawItems];
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeFields(items: any[], label: string) {
  if (items.length === 0) {
    console.log(`  (${label}: 응답 없음)`);
    return;
  }
  const fieldStat = new Map<string, { present: number; empty: number }>();
  for (const it of items) {
    for (const key of Object.keys(it)) {
      const stat = fieldStat.get(key) ?? { present: 0, empty: 0 };
      const v = it[key];
      if (v === undefined || v === null || v === "") stat.empty++;
      else stat.present++;
      fieldStat.set(key, stat);
    }
  }
  for (const [key, stat] of [...fieldStat.entries()].sort()) {
    console.log(`    ${key}: 값있음 ${stat.present} / 비어있음 ${stat.empty}`);
  }
}

interface RepItem {
  contentTypeId: string;
  contentTypeNameKo: string;
  contentId: string;
  name: string;
  fromExistingPlace: boolean;
}

async function main() {
  const db = getDb();

  console.log("=== PHASE 3-E 실행 전 계획 ===\n");
  console.log(`1) 유형별 대표 표본: ${CONTENT_TYPES.map((c) => c.nameKo).join("/")} 각 ${SAMPLES_PER_TYPE}건 = 최대 ${SAMPLES_PER_TYPE * CONTENT_TYPES.length}건`);
  console.log("   - 관광지(12)/문화시설(14)/음식점(39): 기존 places(Phase 3-D 저장분)에서 SELECT");
  console.log("   - 숙박(32): Phase 3-D에서 저장분 0건 → areaBasedList2 1회 추가 호출로 표본만 조회(저장 안 함)");
  console.log(`2) 예상 API 호출: areaBasedList2 최대 1회(숙박 표본용) + detailCommon2 최대 ${SAMPLES_PER_TYPE * CONTENT_TYPES.length}회 + detailIntro2 최대 ${SAMPLES_PER_TYPE * CONTENT_TYPES.length}회 = 최대 ${1 + SAMPLES_PER_TYPE * CONTENT_TYPES.length * 2}회`);
  console.log("3) DB 쓰기: 없음 (SELECT만, places INSERT/UPDATE 전혀 없음)");
  console.log("4) 이번 단계 결과는 검증/저장계획 보고까지만 — 실제 반영은 별도 승인 후 진행\n");

  // ── 대표 표본 선정 ──
  const representatives: RepItem[] = [];

  for (const ct of CONTENT_TYPES.filter((c) => c.id !== "32")) {
    const rows = await db
      .select({ externalContentId: places.externalContentId, name: places.name })
      .from(places)
      .where(drizzleSql`${places.externalContentTypeId} = ${ct.id}`)
      .limit(SAMPLES_PER_TYPE);
    for (const r of rows) {
      if (r.externalContentId) {
        representatives.push({ contentTypeId: ct.id, contentTypeNameKo: ct.nameKo, contentId: r.externalContentId, name: r.name, fromExistingPlace: true });
      }
    }
  }

  console.log("=== 숙박(32) 표본 확보용 areaBasedList2 1회 호출 (places 저장 안 함) ===");
  const lodgingSample = await callApi("areaBasedList2", {
    numOfRows: String(SAMPLES_PER_TYPE),
    pageNo: "1",
    areaCode: "1", // 서울
    contentTypeId: "32",
  });
  if (Array.isArray(lodgingSample)) {
    for (const it of lodgingSample.slice(0, SAMPLES_PER_TYPE)) {
      representatives.push({ contentTypeId: "32", contentTypeNameKo: "숙박", contentId: String(it.contentid), name: it.title, fromExistingPlace: false });
    }
  }

  console.log(`\n=== 대표 표본 ${representatives.length}건 ===`);
  for (const r of representatives) {
    console.log(`  [${r.contentTypeNameKo}] contentId=${r.contentId} name="${r.name}" (${r.fromExistingPlace ? "기존 places" : "신규 조회, 미저장"})`);
  }

  // ── detailCommon2 / detailIntro2 실제 호출 ──
  let apiCallCount = 1; // 위 areaBasedList2 1회 이미 포함
  const commonResults: any[] = [];
  const introResults: any[] = [];
  const perItemQuality: { contentId: string; contentTypeNameKo: string; overviewNull: boolean; homepageNull: boolean; commonModifiedAt: string | null; introFieldCount: number }[] = [];

  for (const rep of representatives) {
    console.log(`\n--- contentId=${rep.contentId} (${rep.contentTypeNameKo}) ---`);

    apiCallCount++;
    // 실측 결과(2026-08-19): detailCommon2는 contentId만 받는다 — contentTypeId나
    // defaultYN/firstImageYN 등 흔히 문서에 언급되는 선택 플래그를 추가하면
    // INVALID_REQUEST_PARAMETER_ERROR로 거부된다(이 API 버전 실제 동작, 디버그로 확인).
    const common = await callApi("detailCommon2", { contentId: rep.contentId });
    if (Array.isArray(common) && common.length > 0) {
      commonResults.push(...common);
      console.log("  detailCommon2 필드:");
      summarizeFields(common, "detailCommon2");
    } else {
      console.log("  detailCommon2: 응답 없음/오류");
    }

    apiCallCount++;
    const intro = await callApi("detailIntro2", { contentId: rep.contentId, contentTypeId: rep.contentTypeId });
    if (Array.isArray(intro) && intro.length > 0) {
      introResults.push(...intro);
      console.log("  detailIntro2 필드:");
      summarizeFields(intro, "detailIntro2");
    } else {
      console.log("  detailIntro2: 응답 없음/오류");
    }

    const c = Array.isArray(common) && common.length > 0 ? common[0] : null;
    const i = Array.isArray(intro) && intro.length > 0 ? intro[0] : null;
    perItemQuality.push({
      contentId: rep.contentId,
      contentTypeNameKo: rep.contentTypeNameKo,
      overviewNull: !c?.overview,
      homepageNull: !c?.homepage,
      commonModifiedAt: c?.modifiedtime ?? null,
      introFieldCount: i ? Object.keys(i).length : 0,
    });
  }

  // ── §8 보고: 저장 대상 컬럼 매핑 분석 (실제 관측된 필드 기준, 가정으로 나열하지 않음) ──
  console.log("\n\n=== detailCommon2 → 현재 places 스키마 매핑 가능 여부 (실제 관측된 필드 전부) ===");
  const KNOWN_MAPPING: Record<string, string> = {
    overview: "places.overview",
    homepage: "places.homepage",
    tel: "places.tel",
    addr1: "places.address",
    mapx: "places.lng",
    mapy: "places.lat",
    modifiedtime: "places.externalModifiedAt",
    cat1: "places.categoryCode1",
    cat2: "places.categoryCode2",
    cat3: "places.categoryCode3",
    areacode: "places.externalAreaCode",
    sigungucode: "places.externalSigunguCode",
    contentid: "places.externalContentId",
    contenttypeid: "places.externalContentTypeId",
    title: "places.name",
  };
  const observedCommonFields = new Set<string>();
  for (const c of commonResults) for (const k of Object.keys(c)) observedCommonFields.add(k);
  for (const field of [...observedCommonFields].sort()) {
    const mapping = KNOWN_MAPPING[field];
    console.log(`  ${field} → ${mapping ? mapping + " (매핑 가능)" : "매핑 컬럼 없음"}`);
  }

  console.log("\n=== detailIntro2 → 현재 places 스키마 매핑 가능 여부 ===");
  console.log("  detailIntro2는 콘텐츠유형별로 필드가 전부 달라진다(관광지/문화시설/음식점/숙박마다 스키마 상이).");
  console.log("  아래는 이번 호출에서 실제로 관측된 필드명이다 — 전부 현재 places 컬럼과 매핑되는 대상이 없다:");
  const introFieldsByType = new Map<string, Set<string>>();
  for (let idx = 0; idx < representatives.length; idx++) {
    const rep = representatives[idx];
    const i = introResults[idx];
    if (!i) continue;
    const set = introFieldsByType.get(rep.contentTypeNameKo) ?? new Set<string>();
    for (const k of Object.keys(i)) {
      if (!["contentid", "contenttypeid"].includes(k)) set.add(k);
    }
    introFieldsByType.set(rep.contentTypeNameKo, set);
  }
  for (const [type, fields] of introFieldsByType) {
    console.log(`  [${type}] ${[...fields].sort().join(", ")}`);
  }
  console.log("  => 결론: detailIntro2 필드를 저장하려면 새 컬럼(스키마 변경)이 필요하다 — 이번 Phase 범위 밖, 스키마 변경 없이 검증만 함.");

  console.log("\n=== 데이터 품질 관찰 ===");
  for (const q of perItemQuality) {
    console.log(
      `  [${q.contentTypeNameKo}] contentId=${q.contentId}: overview NULL=${q.overviewNull}, homepage NULL=${q.homepageNull}, modifiedtime="${q.commonModifiedAt}", detailIntro2 필드수=${q.introFieldCount}`
    );
  }

  console.log(`\n=== 실제 API 호출 횟수: ${apiCallCount}회 ===`);
  console.log("\n=== PHASE 3-E 검증 종료 (places INSERT/UPDATE 없음, 저장 계획 보고까지만) ===");
}

main().catch((error) => {
  console.error("\n중단됨:", error?.message ?? error);
  process.exit(1);
});
