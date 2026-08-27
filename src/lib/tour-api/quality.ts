/**
 * TourAPI 데이터 정제/검증 규칙 (Phase 3-I, docs/PHASE3H_DATA_QUALITY_RULES.md 구현).
 *
 * 전부 순수 함수다 — DB/네트워크를 전혀 건드리지 않는다(scripts/test-phase3i-quality-rules-unit.ts
 * 로 단위 테스트 가능). 원본 보존 원칙(docs/PHASE3H_DATA_QUALITY_RULES.md §3)에 따라, 어떤
 * 함수도 "이상한 값"을 자동으로 고치거나 지우지 않는다 — warning만 반환하고 값은 호출자가
 * 그대로 저장 여부를 판단한다.
 */

// ── homepage ─────────────────────────────────────────────────────────────
export type HomepageWarning = "HOMEPAGE_INVALID";

export interface NormalizedHomepage {
  /** 정제된 순수 URL, 또는 정제 실패 시 원본 그대로. 빈 값이면 null. */
  value: string | null;
  warning: HomepageWarning | null;
  /** href 추출 등으로 원본과 다른 값이 됐는지 여부(품질 리포트 집계용). */
  changed: boolean;
}

/**
 * detailCommon2.homepage 정제 (docs/PHASE3H_DATA_QUALITY_RULES.md §4).
 * 1) 순수 URL이면 그대로. 2) HTML anchor면 href 값만 추출(깨진 HTML이라도 href="..." 자체는
 * 온전한 경우가 실제로 있었다 — Phase 3-G 실측, 가새기오름 사례). 3) 추출/원본이 http(s)가
 * 아니면 원본을 임의로 바꾸지 않고 warning만 반환.
 */
export function normalizeHomepage(raw: string | null | undefined): NormalizedHomepage {
  if (raw === null || raw === undefined) return { value: null, warning: null, changed: false };
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, warning: null, changed: false };

  const hrefMatch = trimmed.match(/href=["']([^"']+)["']/i);
  if (hrefMatch) {
    const url = hrefMatch[1];
    if (/^https?:\/\//i.test(url)) {
      return { value: url, warning: null, changed: url !== trimmed };
    }
    // href는 있었지만 http(s)가 아님(mailto:, 상대경로 등) — 원본 그대로 보존, warning만.
    return { value: trimmed, warning: "HOMEPAGE_INVALID", changed: false };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return { value: trimmed, warning: null, changed: false };
  }

  return { value: trimmed, warning: "HOMEPAGE_INVALID", changed: false };
}

// ── homepage 조회 시점 판정 (Phase 3-K-4) ───────────────────────────────────
export type HomepageDisplayStatus = "CLICKABLE" | "NON_CLICKABLE" | "NO_HOMEPAGE";

export interface HomepageDisplay {
  /** CLICKABLE일 때만 값이 있다. 그 외에는 항상 null — 원본 HTML/비정상 문자열을
   *  API/UI에 그대로 노출하지 않는다(docs/PHASE3K_QUALITY_POLICY.md §6.4/§7). */
  url: string | null;
  status: HomepageDisplayStatus;
}

/**
 * 저장된 places.homepage 원본값(이미 정제됐든, Phase 3-I 이전 데이터라 아직 원본 HTML이
 * 남아있든 무관)을 조회/표시 시점에 판정한다. normalizeHomepage()를 그대로 재사용할 뿐,
 * 새 HTML 파싱이나 URL 정규화 로직은 추가하지 않는다(docs/PHASE3K_QUALITY_POLICY.md §8).
 * DB는 절대 수정하지 않는다 — 매 호출마다 다시 계산하는 순수 함수다.
 */
export function getHomepageDisplayStatus(raw: string | null | undefined): HomepageDisplay {
  const normalized = normalizeHomepage(raw);
  if (normalized.value === null) {
    return { status: "NO_HOMEPAGE", url: null };
  }
  if (normalized.warning === null && /^https?:\/\//i.test(normalized.value)) {
    return { status: "CLICKABLE", url: normalized.value };
  }
  return { status: "NON_CLICKABLE", url: null };
}

// ── tel ──────────────────────────────────────────────────────────────────
export type TelWarning = "TEL_FORMAT_UNUSUAL";

export interface NormalizedTel {
  value: string | null;
  warning: TelWarning | null;
}

/** docs/PHASE3H_DATA_QUALITY_RULES.md §6 — 형식이 이상해도 저장은 그대로, warning만. */
export function normalizeTel(raw: string | null | undefined): NormalizedTel {
  if (raw === null || raw === undefined) return { value: null, warning: null };
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, warning: null };
  const looksValid = /^[0-9()+\-.\s]+$/.test(trimmed);
  return { value: trimmed, warning: looksValid ? null : "TEL_FORMAT_UNUSUAL" };
}

// ── overview ─────────────────────────────────────────────────────────────

/** docs/PHASE3H_DATA_QUALITY_RULES.md §5 — 앞뒤 공백만 제거, 문장 재작성/요약 금지. */
export function normalizeOverview(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

// ── 빈 값 보호 (COALESCE(NULLIF(new,''), old) 코드 레벨 동치) ──────────────

/** docs/PHASE3H_DATA_QUALITY_RULES.md §13.4 — 새 값이 비어있으면 기존 값을 유지한다. */
export function coalesceIfEmpty<T>(newValue: T | null | undefined, existing: T | null): T | null {
  if (newValue === null || newValue === undefined) return existing;
  if (typeof newValue === "string" && newValue === "") return existing;
  return newValue;
}

// ── externalModifiedAt ──────────────────────────────────────────────────
export type ModifiedAtWarning = "INVALID_MODIFIED_AT";

export interface ParsedModifiedAt {
  value: Date | null;
  warning: ModifiedAtWarning | null;
}

/**
 * TourAPI modifiedtime(YYYYMMDDHHmmss) 파싱 — Phase 3-D에서 이미 검증된 알고리즘 그대로
 * 재사용한다(재구현하지 않음, docs/PHASE3H_DATA_QUALITY_RULES.md §7). 빈 값은 오류가 아니라
 * 단순 결측으로 취급 — warning을 내지 않는다.
 */
export function parseExternalModifiedAt(raw: unknown): ParsedModifiedAt {
  if (raw === null || raw === undefined || raw === "") return { value: null, warning: null };
  if (typeof raw !== "string" || !/^\d{14}$/.test(raw)) {
    return { value: null, warning: "INVALID_MODIFIED_AT" };
  }
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const second = Number(raw.slice(12, 14));
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // 13월 같은 잘못된 날짜는 Date가 다음 해로 조용히 이월시키므로 되짚어 검증한다.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return { value: null, warning: "INVALID_MODIFIED_AT" };
  }
  return { value: d, warning: null };
}

/**
 * 재수집 정책(docs/PHASE3H_DATA_QUALITY_RULES.md §13.1) — 새 modifiedAt이 기존보다 더
 * 최근일 때만 UPDATE, 그 외(같음/과거/파싱실패)는 SKIP. 파싱 실패(new=null)는 항상 SKIP —
 * 알 수 없는 값으로 정상 값을 밀어내지 않는다.
 */
export function decideRecollectionAction(existing: Date | null, next: Date | null): "UPDATE" | "SKIP" {
  if (next === null) return "SKIP";
  if (existing === null) return "UPDATE";
  return next.getTime() > existing.getTime() ? "UPDATE" : "SKIP";
}

// ── 좌표 품질 ────────────────────────────────────────────────────────────
export type CoordinateWarning =
  | "INVALID_NUMBER"
  | "LAT_OUT_OF_RANGE"
  | "LNG_OUT_OF_RANGE"
  | "ZERO_COORDINATE"
  | "OUT_OF_KOREA_BOUNDS"
  | "POSSIBLY_SWAPPED";

export interface ValidatedCoordinate {
  lat: number | null;
  lng: number | null;
  warnings: CoordinateWarning[];
}

// 대한민국 대략적 권역(제주 포함) — Phase 3-D부터 일관되게 쓰는 경계값 재사용.
const KOREA_LAT_MIN = 33.0;
const KOREA_LAT_MAX = 39.0;
const KOREA_LNG_MIN = 124.5;
const KOREA_LNG_MAX = 132.0;

/**
 * docs/PHASE3H_DATA_QUALITY_RULES.md §8 — 자동 수정/삭제 없음, warning만 생성한다.
 * `domestic`이 false면(해외 장소) 대한민국 권역 검사(OUT_OF_KOREA_BOUNDS)는 건너뛴다 —
 * 이번 Phase의 TourAPI 데이터는 전부 국내이므로 기본값 true.
 */
export function validateCoordinate(
  latRaw: string | number | null | undefined,
  lngRaw: string | number | null | undefined,
  options: { domestic?: boolean } = {}
): ValidatedCoordinate {
  const domestic = options.domestic ?? true;
  const warnings: CoordinateWarning[] = [];

  const latEmpty = latRaw === null || latRaw === undefined || latRaw === "";
  const lngEmpty = lngRaw === null || lngRaw === undefined || lngRaw === "";
  if (latEmpty && lngEmpty) return { lat: null, lng: null, warnings };

  const lat = latEmpty ? null : Number(latRaw);
  const lng = lngEmpty ? null : Number(lngRaw);
  if ((lat !== null && Number.isNaN(lat)) || (lng !== null && Number.isNaN(lng))) {
    warnings.push("INVALID_NUMBER");
    return { lat: null, lng: null, warnings };
  }

  if (lat !== null && (lat < -90 || lat > 90)) warnings.push("LAT_OUT_OF_RANGE");
  if (lng !== null && (lng < -180 || lng > 180)) warnings.push("LNG_OUT_OF_RANGE");
  if (lat === 0 && lng === 0) warnings.push("ZERO_COORDINATE");

  if (domestic && lat !== null && lng !== null) {
    const withinKorea = lat >= KOREA_LAT_MIN && lat <= KOREA_LAT_MAX && lng >= KOREA_LNG_MIN && lng <= KOREA_LNG_MAX;
    if (!withinKorea) warnings.push("OUT_OF_KOREA_BOUNDS");

    const latLooksLikeLng = lat >= KOREA_LNG_MIN && lat <= KOREA_LNG_MAX;
    const lngLooksLikeLat = lng >= KOREA_LAT_MIN && lng <= KOREA_LAT_MAX;
    if (latLooksLikeLng && lngLooksLikeLat) warnings.push("POSSIBLY_SWAPPED");
  }

  return { lat, lng, warnings };
}

/**
 * 좌표를 지도/좌표 의존 UI에 신뢰하고 노출해도 되는지 조회 시점에 판정한다
 * (docs/PHASE3K_QUALITY_POLICY.md §5.3, K-5). validateCoordinate()를 그대로 재사용할 뿐,
 * 새 좌표 검증 로직은 추가하지 않는다. false면 지도 마커 제외/좌표 의존 기능 비활성화 대상
 * (§5.3) — lat/lng 원본값은 이 함수가 절대 수정하지 않는다(DB 미접근, 순수 함수).
 * lat/lng이 둘 다 결측인 경우는 warnings가 비어있으므로(§8.2 "정상, 경고 아님") true를
 * 반환한다 — "좌표가 없다"와 "좌표가 신뢰할 수 없다"는 다른 상태다.
 *
 * PHASE 13-6 — validateCoordinate()가 이미 갖고 있던 domestic 옵션을 그대로 통과시킨다(새
 * 검증 로직 추가 아님). 옵션을 생략하면 validateCoordinate()의 기본값(domestic=true)이 그대로
 * 적용되어 기존 모든 호출부(TourAPI 120건 등)는 이 변경 전과 100% 동일하게 판정된다.
 */
export function isCoordinateReliable(
  latRaw: string | number | null | undefined,
  lngRaw: string | number | null | undefined,
  options: { domestic?: boolean } = {}
): boolean {
  return validateCoordinate(latRaw, lngRaw, options).warnings.length === 0;
}

// ── 지역 매핑 검증 ───────────────────────────────────────────────────────
export type RegionMappingError = "AREA_CODE_MISMATCH" | "SIGUNGU_CODE_MISMATCH" | "LEGACY_JEJU_SIGUNGU";

export interface RegionMappingResult {
  ok: boolean;
  error: RegionMappingError | null;
}

/** 제주(areaCode=39)의 폐지된 sigunguCode(1=남제주군, 2=북제주군)인지 — areaCode와 결합해서만 판단한다. */
function isLegacyJejuSigungu(areaCode: string, sigunguCode: string | null): boolean {
  return areaCode === "39" && (sigunguCode === "1" || sigunguCode === "2");
}

/**
 * docs/PHASE3H_DATA_QUALITY_RULES.md §9 — areaCode+sigunguCode+지역명(호출자가 이미 알고
 * 있는 expected 값)을 함께 검증한다. sigunguCode 숫자 하나만으로는 절대 판단하지 않는다 —
 * 서울(areaCode=1)도 자체 구 코드로 1/2를 쓰므로, 제주 폐지코드 검사는 areaCode=39와
 * 결합했을 때만 발동한다(그래서 이 검사가 "기대값과 일치하는가" 검사보다 항상 먼저 온다 —
 * 설령 잘못된 expected로 39/1을 요청했더라도 이 검사가 우선 걸러낸다).
 */
export function validateRegionMapping(
  actual: { areaCode: string; sigunguCode: string | null },
  expected: { areaCode: string; sigunguCode: string | null }
): RegionMappingResult {
  if (isLegacyJejuSigungu(actual.areaCode, actual.sigunguCode)) {
    return { ok: false, error: "LEGACY_JEJU_SIGUNGU" };
  }
  if (actual.areaCode !== expected.areaCode) {
    return { ok: false, error: "AREA_CODE_MISMATCH" };
  }
  if (expected.sigunguCode !== null && actual.sigunguCode !== expected.sigunguCode) {
    return { ok: false, error: "SIGUNGU_CODE_MISMATCH" };
  }
  return { ok: true, error: null };
}

// ── contentType 매핑 ─────────────────────────────────────────────────────

/** docs/PHASE3H_DATA_QUALITY_RULES.md §10, docs/PHASE3C_SCHEMA_CHANGE_PROPOSAL.md 확정값 그대로. */
export const CONTENT_TYPE_TO_CATEGORY: Readonly<Record<string, string>> = {
  "12": "tourism",
  "14": "tourism",
  "15": "experience",
  "25": "course",
  "28": "experience",
  "32": "accommodation",
  "38": "shopping",
  "39": "food",
};

export function mapContentTypeToCategory(contentTypeId: string): string | null {
  return CONTENT_TYPE_TO_CATEGORY[contentTypeId] ?? null;
}

// ── 품질 warning 집계 ────────────────────────────────────────────────────

/**
 * docs/PHASE3H_DATA_QUALITY_RULES.md §12/§17 — DB 컬럼을 추가하지 않고 실행 로그/보고서로만
 * 남긴다(이번 Phase에서는 스키마 변경 없음). 필드는 사용자가 제시한 예시 구조를 그대로 따른다.
 */
export interface QualityWarningCounts {
  invalidCoordinate: number;
  homepageHtmlNormalized: number;
  homepageInvalid: number;
  emptyTel: number;
  invalidModifiedAt: number;
  invalidRegion: number;
}

export function createQualityWarningCounts(): QualityWarningCounts {
  return {
    invalidCoordinate: 0,
    homepageHtmlNormalized: 0,
    homepageInvalid: 0,
    emptyTel: 0,
    invalidModifiedAt: 0,
    invalidRegion: 0,
  };
}
