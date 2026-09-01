import type { TripRequest } from "@/lib/types";
import { generateItinerary, planCacheKeyFor } from "@/lib/itinerary";
import { getCachedPlan } from "@/db/itinerary-plan-cache";

/**
 * itinerary_plan_cache 프리워밍.
 *
 * generateItinerary()는 AI 생성에 성공하면 planCacheKeyFor(request)와 같은 키로 일정 뼈대를
 * itinerary_plan_cache에 저장하고, 이후 AI가 2회 연속 실패하면(무료 쿼터 소진 등) 결정론적
 * 폴백보다 먼저 이 캐시를 쓴다. 즉 쿼터가 넉넉할 때 아래 조합들을 한 번 돌려 두면, 심사 중
 * Gemini 무료 쿼터가 말라도 해당 요청은 폴백 템플릿이 아니라 실제 AI 일정을 돌려준다.
 *
 * 주의 — requestSeedKey는 destination·memberType·memberCount·nights·month·purposes(배열 순서
 * 포함)·notes를 전부 정확히 해싱한다. 아래 값과 한 글자라도 다르면 캐시가 히트하지 않는다.
 * 그래서 가장 확실한 방법은 "쿼터가 넉넉할 때 데모 입력 그대로 UI에서 한 번 생성"하는 것이고
 * (그 실행이 UI가 만드는 정확한 키로 캐시를 채운다), 이 스크립트/크론은 상위 지역 변형까지
 * best-effort로 함께 채워 두는 보조 수단이다.
 */
export const PREWARM_SCENARIOS: TripRequest[] = [
  // PRD §23 데모: 3박4일 도쿄, 가족, 힐링 + 맛집
  {
    destination: "도쿄",
    region: "해외",
    memberType: "가족",
    memberCount: 4,
    nights: 3,
    month: 9,
    purposes: [
      { id: "healing", priority: "core" },
      { id: "food", priority: "core" },
    ],
    notes: "",
  },
  {
    destination: "도쿄",
    region: "해외",
    memberType: "가족",
    memberCount: 4,
    nights: 3,
    month: 10,
    purposes: [
      { id: "healing", priority: "core" },
      { id: "food", priority: "core" },
    ],
    notes: "",
  },
  // 국내 상위 지역 변형
  {
    destination: "제주도",
    region: "국내",
    memberType: "가족",
    memberCount: 4,
    nights: 3,
    month: 9,
    purposes: [
      { id: "healing", priority: "core" },
      { id: "nature", priority: "important" },
    ],
    notes: "",
  },
  {
    destination: "서울",
    region: "국내",
    memberType: "친구",
    memberCount: 2,
    nights: 2,
    month: 9,
    purposes: [
      { id: "food", priority: "core" },
      { id: "attraction", priority: "important" },
    ],
    notes: "",
  },
  {
    destination: "부산",
    region: "국내",
    memberType: "연인",
    memberCount: 2,
    nights: 2,
    month: 10,
    purposes: [
      { id: "healing", priority: "core" },
      { id: "food", priority: "important" },
    ],
    notes: "",
  },
];

export interface PrewarmResult {
  destination: string;
  month: number;
  /** cached: 이미 신선한 캐시가 있어 건너뜀 / warmed: AI 생성 성공, 캐시에 저장됨 /
   *  fallback: AI가 실패해 폴백으로 떨어짐(캐시 미저장, 다음 실행에서 재시도) / error: 예외 */
  status: "cached" | "warmed" | "fallback" | "error";
  error?: string;
}

/**
 * PREWARM_SCENARIOS(또는 넘겨준 목록)를 순회하며, 아직 캐시에 없는 조합만 generateItinerary로
 * 생성한다. 순차 실행 — 병렬로 돌리면 AI RPM 한도에 서로 걸려 오히려 429가 난다. 각 항목은
 * 독립적으로 try/catch 하므로 일부가 실패해도 나머지는 계속 진행되고, 이미 저장된 항목은
 * 다음 실행에서 다시 건드리지 않는다.
 */
export async function prewarmPlans(scenarios: TripRequest[] = PREWARM_SCENARIOS): Promise<PrewarmResult[]> {
  const results: PrewarmResult[] = [];
  for (const request of scenarios) {
    const base = { destination: request.destination, month: request.month };
    try {
      const existing = await getCachedPlan(planCacheKeyFor(request)).catch(() => null);
      if (existing) {
        results.push({ ...base, status: "cached" });
        continue;
      }
      const itinerary = await generateItinerary(request);
      results.push({ ...base, status: itinerary.usedFallback ? "fallback" : "warmed" });
    } catch (error) {
      results.push({ ...base, status: "error", error: String(error) });
    }
  }
  return results;
}
