/**
 * 지역 마스터 1차 시딩 (docs/REGION_MASTER_SEED_PLAN.md, Phase 2-B).
 *
 * 실행:
 *   dotenv -e .env.local -- tsx scripts/seed-regions.ts --dry-run   (검증만, INSERT 없음)
 *   dotenv -e .env.local -- tsx scripts/seed-regions.ts             (검증 통과 시에만 실제 INSERT)
 *
 * source/sourceReference는 이 배열(코드) 자체에만 존재하고 regions 테이블에는 쓰지 않는다 —
 * regions 스키마에 그 용도의 컬럼이 없고(docs/DATA_SCHEMA_PROPOSAL.md §2), 이번 단계에서는
 * 스키마 변경 없이 "기존 구조 안에서" 처리하기로 했다(docs/REGION_MASTER_SEED_PLAN.md 갱신
 * 근거). 감사 추적이 필요하면 이 파일의 git 이력 자체가 근거가 된다. 컬럼으로 영속 저장이
 * 필요해지면 별도 additive migration(예: regions.source, regions.source_reference nullable
 * text 추가)으로 제안한다 — 지금은 추가하지 않는다.
 */
import { getDb } from "@/db";
import { regions } from "@/db/schema";

type RegionStatus = "confirmed" | "subregion";
type SeedSource = "administrative_fact" | "existing_codebase";

interface SeedRegion {
  code: string;
  parentCode: string | null;
  level: string;
  domesticOverseas: "domestic" | "overseas";
  nameKo: string;
  nameLocal?: string;
  countryCode?: string;
  status: RegionStatus;
  source: SeedSource;
  sourceReference: string;
}

const DESTINATIONS_REF = "src/lib/mock/destinations.ts DESTINATIONS";
const AMBIGUOUS_REF = (key: string) => `src/lib/mock/destinations.ts AMBIGUOUS_DESTINATIONS["${key}"]`;
const REGION_RULES_REF = "docs/REGION_RULES.md §7.3 (관광 맥락 관용 지명, 행정구역 리 단위 아님)";

// 부모가 항상 자식보다 먼저 오도록 순서를 유지한다 (seedRegions()의 삽입 순서 = 이 배열 순서).
const SEED_REGIONS: SeedRegion[] = [
  // ── 최상위 3개 ──────────────────────────────────────────────────────
  { code: "KR", parentCode: null, level: "nation", domesticOverseas: "domestic", nameKo: "대한민국", status: "confirmed", source: "administrative_fact", sourceReference: "대한민국 (ISO 3166-1: KR)" },
  { code: "ASIA", parentCode: null, level: "continent", domesticOverseas: "overseas", nameKo: "아시아", status: "confirmed", source: "administrative_fact", sourceReference: "대륙 구분(통용)" },
  { code: "EUROPE", parentCode: null, level: "continent", domesticOverseas: "overseas", nameKo: "유럽", status: "confirmed", source: "administrative_fact", sourceReference: "대륙 구분(통용)" },

  // ── 국내: 시/도 17개 (CLAUDE_CODE_TASK.md §23 고정 목록) ──────────────
  { code: "KR-SEOUL", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "서울특별시", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-BUSAN", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "부산광역시", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-DAEGU", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "대구광역시", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-INCHEON", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "인천광역시", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-GWANGJU", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "광주광역시", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-DAEJEON", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "대전광역시", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-ULSAN", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "울산광역시", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-SEJONG", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "세종특별자치시", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-GYEONGGI", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "경기도", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-GANGWON", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "강원특별자치도", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-CHUNGBUK", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "충청북도", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-CHUNGNAM", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "충청남도", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-JEONBUK", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "전북특별자치도", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-JEONNAM", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "전라남도", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-GYEONGBUK", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "경상북도", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-GYEONGNAM", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "경상남도", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },
  { code: "KR-JEJU", parentCode: "KR", level: "province", domesticOverseas: "domestic", nameKo: "제주특별자치도", status: "confirmed", source: "administrative_fact", sourceReference: "CLAUDE_CODE_TASK.md §23" },

  // ── 국내: 시/군/구 9개 (전부 명확한 행정 단위 = A. confirmed) ──────────
  { code: "KR-BUSAN-CITY", parentCode: "KR-BUSAN", level: "city_county_district", domesticOverseas: "domestic", nameKo: "부산", status: "confirmed", source: "existing_codebase", sourceReference: DESTINATIONS_REF },
  { code: "KR-GANGWON-GANGNEUNG", parentCode: "KR-GANGWON", level: "city_county_district", domesticOverseas: "domestic", nameKo: "강릉시", status: "confirmed", source: "existing_codebase", sourceReference: DESTINATIONS_REF },
  { code: "KR-JEONNAM-YEOSU", parentCode: "KR-JEONNAM", level: "city_county_district", domesticOverseas: "domestic", nameKo: "여수시", status: "confirmed", source: "existing_codebase", sourceReference: DESTINATIONS_REF },
  { code: "KR-GYEONGBUK-GYEONGJU", parentCode: "KR-GYEONGBUK", level: "city_county_district", domesticOverseas: "domestic", nameKo: "경주시", status: "confirmed", source: "existing_codebase", sourceReference: DESTINATIONS_REF },
  { code: "KR-JEJU-JEJUSI", parentCode: "KR-JEJU", level: "city_county_district", domesticOverseas: "domestic", nameKo: "제주시", status: "confirmed", source: "administrative_fact", sourceReference: "제주특별자치도 행정시(고정 2개)" },
  { code: "KR-JEJU-SEOGWIPO", parentCode: "KR-JEJU", level: "city_county_district", domesticOverseas: "domestic", nameKo: "서귀포시", status: "confirmed", source: "administrative_fact", sourceReference: "제주특별자치도 행정시(고정 2개)" },
  { code: "KR-GYEONGGI-GWANGJU", parentCode: "KR-GYEONGGI", level: "city_county_district", domesticOverseas: "domestic", nameKo: "경기 광주시", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("광주") },
  { code: "KR-GANGWON-GOSEONG", parentCode: "KR-GANGWON", level: "city_county_district", domesticOverseas: "domestic", nameKo: "강원 고성군", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("고성") },
  { code: "KR-GYEONGNAM-GOSEONG", parentCode: "KR-GYEONGNAM", level: "city_county_district", domesticOverseas: "domestic", nameKo: "경남 고성군", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("고성") },

  // ── 국내: 제주 세부지역 8개 (C. 관광 관용 지명 → subregion, 행정구역과 동일 취급 안 함) ──
  { code: "KR-JEJU-JEJUSI-AEWOL", parentCode: "KR-JEJU-JEJUSI", level: "district", domesticOverseas: "domestic", nameKo: "애월", status: "subregion", source: "existing_codebase", sourceReference: REGION_RULES_REF },
  { code: "KR-JEJU-JEJUSI-HALLIM", parentCode: "KR-JEJU-JEJUSI", level: "district", domesticOverseas: "domestic", nameKo: "한림", status: "subregion", source: "existing_codebase", sourceReference: REGION_RULES_REF },
  { code: "KR-JEJU-JEJUSI-HYEOPJAE", parentCode: "KR-JEJU-JEJUSI", level: "district", domesticOverseas: "domestic", nameKo: "협재", status: "subregion", source: "existing_codebase", sourceReference: REGION_RULES_REF },
  { code: "KR-JEJU-JEJUSI-JOCHEON", parentCode: "KR-JEJU-JEJUSI", level: "district", domesticOverseas: "domestic", nameKo: "조천", status: "subregion", source: "existing_codebase", sourceReference: REGION_RULES_REF },
  { code: "KR-JEJU-JEJUSI-UDO", parentCode: "KR-JEJU-JEJUSI", level: "district", domesticOverseas: "domestic", nameKo: "우도", status: "subregion", source: "existing_codebase", sourceReference: REGION_RULES_REF },
  { code: "KR-JEJU-SEOGWIPO-SEONGSAN", parentCode: "KR-JEJU-SEOGWIPO", level: "district", domesticOverseas: "domestic", nameKo: "성산", status: "subregion", source: "existing_codebase", sourceReference: REGION_RULES_REF },
  { code: "KR-JEJU-SEOGWIPO-JUNGMUN", parentCode: "KR-JEJU-SEOGWIPO", level: "district", domesticOverseas: "domestic", nameKo: "중문", status: "subregion", source: "existing_codebase", sourceReference: REGION_RULES_REF },
  { code: "KR-JEJU-SEOGWIPO-PYOSEON", parentCode: "KR-JEJU-SEOGWIPO", level: "district", domesticOverseas: "domestic", nameKo: "표선", status: "subregion", source: "existing_codebase", sourceReference: REGION_RULES_REF },

  // ── 해외: 국가 6개 (ISO 3166-1 = A. confirmed) ────────────────────────
  { code: "JP", parentCode: "ASIA", level: "country", domesticOverseas: "overseas", nameKo: "일본", nameLocal: "Japan", countryCode: "JP", status: "confirmed", source: "administrative_fact", sourceReference: "ISO 3166-1" },
  { code: "VN", parentCode: "ASIA", level: "country", domesticOverseas: "overseas", nameKo: "베트남", nameLocal: "Việt Nam", countryCode: "VN", status: "confirmed", source: "administrative_fact", sourceReference: "ISO 3166-1" },
  { code: "TW", parentCode: "ASIA", level: "country", domesticOverseas: "overseas", nameKo: "대만", nameLocal: "Taiwan", countryCode: "TW", status: "confirmed", source: "administrative_fact", sourceReference: "ISO 3166-1" },
  { code: "CN", parentCode: "ASIA", level: "country", domesticOverseas: "overseas", nameKo: "중국", nameLocal: "China", countryCode: "CN", status: "confirmed", source: "administrative_fact", sourceReference: "ISO 3166-1" },
  { code: "TH", parentCode: "ASIA", level: "country", domesticOverseas: "overseas", nameKo: "태국", nameLocal: "Thailand", countryCode: "TH", status: "confirmed", source: "administrative_fact", sourceReference: "ISO 3166-1" },
  { code: "FR", parentCode: "EUROPE", level: "country", domesticOverseas: "overseas", nameKo: "프랑스", nameLocal: "France", countryCode: "FR", status: "confirmed", source: "administrative_fact", sourceReference: "ISO 3166-1" },

  // ── 해외: 도시 36개 (B. AMBIGUOUS_DESTINATIONS 대표 도시 = confirmed, source=existing_codebase) ──
  { code: "JP-TOKYO", parentCode: "JP", level: "city", domesticOverseas: "overseas", nameKo: "도쿄", nameLocal: "Tokyo", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("일본") },
  { code: "JP-OSAKA", parentCode: "JP", level: "city", domesticOverseas: "overseas", nameKo: "오사카", nameLocal: "Osaka", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("일본") },
  { code: "JP-FUKUOKA", parentCode: "JP", level: "city", domesticOverseas: "overseas", nameKo: "후쿠오카", nameLocal: "Fukuoka", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("일본") },
  { code: "JP-SAPPORO", parentCode: "JP", level: "city", domesticOverseas: "overseas", nameKo: "삿포로", nameLocal: "Sapporo", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("일본") },
  { code: "JP-OKINAWA", parentCode: "JP", level: "city", domesticOverseas: "overseas", nameKo: "오키나와", nameLocal: "Okinawa", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("일본") },
  { code: "JP-KYOTO", parentCode: "JP", level: "city", domesticOverseas: "overseas", nameKo: "교토", nameLocal: "Kyoto", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("일본") },
  { code: "JP-NAGOYA", parentCode: "JP", level: "city", domesticOverseas: "overseas", nameKo: "나고야", nameLocal: "Nagoya", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("일본") },

  { code: "VN-DANANG", parentCode: "VN", level: "city", domesticOverseas: "overseas", nameKo: "다낭", nameLocal: "Da Nang", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("베트남") },
  { code: "VN-HANOI", parentCode: "VN", level: "city", domesticOverseas: "overseas", nameKo: "하노이", nameLocal: "Hanoi", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("베트남") },
  { code: "VN-HOCHIMINH", parentCode: "VN", level: "city", domesticOverseas: "overseas", nameKo: "호치민", nameLocal: "Ho Chi Minh City", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("베트남") },
  { code: "VN-NHATRANG", parentCode: "VN", level: "city", domesticOverseas: "overseas", nameKo: "나트랑", nameLocal: "Nha Trang", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("베트남") },
  { code: "VN-PHUQUOC", parentCode: "VN", level: "city", domesticOverseas: "overseas", nameKo: "푸꾸옥", nameLocal: "Phu Quoc", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("베트남") },
  { code: "VN-HOIAN", parentCode: "VN", level: "city", domesticOverseas: "overseas", nameKo: "호이안", nameLocal: "Hoi An", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("베트남") },
  { code: "VN-DALAT", parentCode: "VN", level: "city", domesticOverseas: "overseas", nameKo: "달랏", nameLocal: "Da Lat", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("베트남") },

  { code: "TW-TAIPEI", parentCode: "TW", level: "city", domesticOverseas: "overseas", nameKo: "타이베이", nameLocal: "Taipei", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("대만") },
  { code: "TW-KAOHSIUNG", parentCode: "TW", level: "city", domesticOverseas: "overseas", nameKo: "가오슝", nameLocal: "Kaohsiung", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("대만") },
  { code: "TW-TAICHUNG", parentCode: "TW", level: "city", domesticOverseas: "overseas", nameKo: "타이중", nameLocal: "Taichung", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("대만") },
  { code: "TW-TAINAN", parentCode: "TW", level: "city", domesticOverseas: "overseas", nameKo: "타이난", nameLocal: "Tainan", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("대만") },
  { code: "TW-HUALIEN", parentCode: "TW", level: "city", domesticOverseas: "overseas", nameKo: "화롄", nameLocal: "Hualien", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("대만") },
  { code: "TW-KENTING", parentCode: "TW", level: "city", domesticOverseas: "overseas", nameKo: "컨딩", nameLocal: "Kenting", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("대만") },

  { code: "CN-SHANGHAI", parentCode: "CN", level: "city", domesticOverseas: "overseas", nameKo: "상하이", nameLocal: "Shanghai", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("중국") },
  { code: "CN-BEIJING", parentCode: "CN", level: "city", domesticOverseas: "overseas", nameKo: "베이징", nameLocal: "Beijing", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("중국") },
  { code: "CN-CHENGDU", parentCode: "CN", level: "city", domesticOverseas: "overseas", nameKo: "청두", nameLocal: "Chengdu", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("중국") },
  { code: "CN-XIAN", parentCode: "CN", level: "city", domesticOverseas: "overseas", nameKo: "시안", nameLocal: "Xi'an", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("중국") },
  { code: "CN-GUANGZHOU", parentCode: "CN", level: "city", domesticOverseas: "overseas", nameKo: "광저우", nameLocal: "Guangzhou", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("중국") },
  { code: "CN-HANGZHOU", parentCode: "CN", level: "city", domesticOverseas: "overseas", nameKo: "항저우", nameLocal: "Hangzhou", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("중국") },

  { code: "TH-BANGKOK", parentCode: "TH", level: "city", domesticOverseas: "overseas", nameKo: "방콕", nameLocal: "Bangkok", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("태국") },
  { code: "TH-CHIANGMAI", parentCode: "TH", level: "city", domesticOverseas: "overseas", nameKo: "치앙마이", nameLocal: "Chiang Mai", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("태국") },
  { code: "TH-PHUKET", parentCode: "TH", level: "city", domesticOverseas: "overseas", nameKo: "푸켓", nameLocal: "Phuket", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("태국") },
  { code: "TH-PATTAYA", parentCode: "TH", level: "city", domesticOverseas: "overseas", nameKo: "파타야", nameLocal: "Pattaya", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("태국") },
  { code: "TH-KRABI", parentCode: "TH", level: "city", domesticOverseas: "overseas", nameKo: "끄라비", nameLocal: "Krabi", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("태국") },

  { code: "FR-PARIS", parentCode: "FR", level: "city", domesticOverseas: "overseas", nameKo: "파리", nameLocal: "Paris", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("프랑스") },
  { code: "FR-NICE", parentCode: "FR", level: "city", domesticOverseas: "overseas", nameKo: "니스", nameLocal: "Nice", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("프랑스") },
  { code: "FR-LYON", parentCode: "FR", level: "city", domesticOverseas: "overseas", nameKo: "리옹", nameLocal: "Lyon", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("프랑스") },
  { code: "FR-MARSEILLE", parentCode: "FR", level: "city", domesticOverseas: "overseas", nameKo: "마르세유", nameLocal: "Marseille", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("프랑스") },
  { code: "FR-STRASBOURG", parentCode: "FR", level: "city", domesticOverseas: "overseas", nameKo: "스트라스부르", nameLocal: "Strasbourg", status: "confirmed", source: "existing_codebase", sourceReference: AMBIGUOUS_REF("프랑스") },
];

const DOMESTIC_LEVELS = new Set(["nation", "province", "city_county_district", "district"]);
const OVERSEAS_LEVELS = new Set(["continent", "country", "region", "city", "district"]);

// 절대 포함되면 안 되는 패턴 (REGION_RULES.md §3 복수지역, §7.2 제주 방향성).
const JEJU_DIRECTIONAL_PATTERN = /제주\s*(동부|서부|남부|북부|동쪽|서쪽|남쪽|북쪽)|(동부|서부|남부|북부)\s*제주/;
const MULTI_REGION_PATTERN = /[,·&]|\s(그리고|앤드)\s|Tokyo.*Kyoto|Kyoto.*Osaka/i;

interface ValidationResult {
  ok: boolean;
  errors: string[];
  summary: Record<string, unknown>;
}

function validate(): ValidationResult {
  const errors: string[] = [];

  // 4. code 중복 검증
  const codeCounts = new Map<string, number>();
  for (const r of SEED_REGIONS) codeCounts.set(r.code, (codeCounts.get(r.code) ?? 0) + 1);
  const duplicateCodes = [...codeCounts.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  if (duplicateCodes.length > 0) errors.push(`중복 code 발견: ${duplicateCodes.join(", ")}`);

  // 3. parent-child 관계 검증 (부모가 배열 안에 존재하고, 자신보다 먼저 나오는지)
  const seenCodes = new Set<string>();
  for (const r of SEED_REGIONS) {
    if (r.parentCode !== null) {
      if (!seenCodes.has(r.parentCode)) {
        errors.push(`${r.code}: 부모 ${r.parentCode}가 배열에서 먼저 나오지 않음(또는 존재하지 않음)`);
      }
    }
    seenCodes.add(r.code);
  }

  // 5. level 검증 (domesticOverseas에 맞는 level 값인지)
  for (const r of SEED_REGIONS) {
    const allowed = r.domesticOverseas === "domestic" ? DOMESTIC_LEVELS : OVERSEAS_LEVELS;
    if (!allowed.has(r.level)) {
      errors.push(`${r.code}: level "${r.level}"이 domesticOverseas="${r.domesticOverseas}"에 허용되지 않음`);
    }
  }

  // 6. 국내/해외 검증 (부모 체인을 따라가며 domesticOverseas가 일관적인지)
  const byCode = new Map(SEED_REGIONS.map((r) => [r.code, r]));
  for (const r of SEED_REGIONS) {
    let cur: SeedRegion | undefined = r;
    while (cur?.parentCode) {
      const parent = byCode.get(cur.parentCode);
      if (parent && parent.domesticOverseas !== r.domesticOverseas) {
        errors.push(`${r.code}: domesticOverseas(${r.domesticOverseas})가 조상 ${parent.code}(${parent.domesticOverseas})와 불일치`);
        break;
      }
      cur = parent;
    }
  }

  // 7. 제주 directional 지역 존재 여부 검증 (있으면 안 됨)
  const directionalHits = SEED_REGIONS.filter((r) => JEJU_DIRECTIONAL_PATTERN.test(r.nameKo));
  if (directionalHits.length > 0) {
    errors.push(`제주 방향성 표현이 시드에 포함됨(있으면 안 됨): ${directionalHits.map((r) => r.code).join(", ")}`);
  }

  // 8. 복수지역 entity 존재 여부 검증 (있으면 안 됨)
  const multiRegionHits = SEED_REGIONS.filter((r) => MULTI_REGION_PATTERN.test(r.nameKo));
  if (multiRegionHits.length > 0) {
    errors.push(`복수지역으로 의심되는 이름이 시드에 포함됨(있으면 안 됨): ${multiRegionHits.map((r) => r.code).join(", ")}`);
  }

  const domesticCount = SEED_REGIONS.filter((r) => r.domesticOverseas === "domestic").length;
  const overseasCount = SEED_REGIONS.filter((r) => r.domesticOverseas === "overseas").length;
  const byLevel: Record<string, number> = {};
  for (const r of SEED_REGIONS) byLevel[r.level] = (byLevel[r.level] ?? 0) + 1;

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      total: SEED_REGIONS.length,
      domestic: domesticCount,
      overseas: overseasCount,
      byLevel,
      byStatus: {
        confirmed: SEED_REGIONS.filter((r) => r.status === "confirmed").length,
        subregion: SEED_REGIONS.filter((r) => r.status === "subregion").length,
      },
      rootNodes: SEED_REGIONS.filter((r) => r.parentCode === null).map((r) => r.code),
      jejuSubregionCodes: SEED_REGIONS.filter((r) => r.status === "subregion").map((r) => r.code),
    },
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`=== 지역 마스터 시딩 ${dryRun ? "(--dry-run, INSERT 없음)" : "(실제 INSERT)"} ===\n`);

  const result = validate();
  console.log("--- 검증 결과 요약 ---");
  console.log(JSON.stringify(result.summary, null, 2));

  if (!result.ok) {
    console.error("\n--- 검증 실패 ---");
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("\n--- 검증 통과 (parent-child / code 중복 / level / 국내-해외 일관성 / 제주 방향성 부재 / 복수지역 부재) ---");

  if (dryRun) {
    console.log(`\n총 ${SEED_REGIONS.length}행이 이 순서로 INSERT될 예정입니다 (dry-run이라 실행 안 함):`);
    for (const r of SEED_REGIONS) {
      console.log(
        `  ${r.code.padEnd(28)} parent=${(r.parentCode ?? "null").padEnd(12)} level=${r.level.padEnd(20)} status=${r.status.padEnd(10)} source=${r.source}`
      );
    }
    console.log("\n=== DRY RUN 종료 (DB 변경 없음) ===");
    return;
  }

  const db = getDb();

  // Production 보호: 실제 INSERT 직전 재확인. 0이 아니면 즉시 중단(자동 UPDATE 금지).
  const countResult = await db.execute<{ count: number }>(`select count(*)::int as count from regions`);
  const existingCount = countResult.rows[0].count;
  if (Number(existingCount) !== 0) {
    console.error(
      `\n중단: regions 테이블이 비어있지 않습니다(현재 ${existingCount}행). 예상치 못한 기존 데이터가 있어 자동으로 진행하지 않습니다.`
    );
    process.exit(1);
  }
  console.log("\nregions 테이블 현재 0행 확인 — 진행합니다.");

  const idByCode = new Map<string, string>();
  let inserted = 0;
  for (const r of SEED_REGIONS) {
    const parentId = r.parentCode ? idByCode.get(r.parentCode) ?? null : null;
    if (r.parentCode && !parentId) {
      console.error(`\n중단: ${r.code}의 부모 ${r.parentCode}가 아직 삽입되지 않았습니다.`);
      process.exit(1);
    }
    const [row] = await db
      .insert(regions)
      .values({
        code: r.code,
        parentRegionId: parentId,
        level: r.level,
        domesticOverseas: r.domesticOverseas,
        nameKo: r.nameKo,
        nameLocal: r.nameLocal ?? null,
        countryCode: r.countryCode ?? null,
        aliases: [],
        status: r.status,
        exclusionReason: null,
      })
      .returning({ id: regions.id });
    idByCode.set(r.code, row.id);
    inserted++;
  }

  console.log(`\n=== INSERT 완료: ${inserted}행 ===`);
}

main().catch((error) => {
  console.error("시딩 실패:", error);
  process.exit(1);
});
