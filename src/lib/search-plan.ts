import type { TripRequest } from "@/lib/types";
import { PURPOSE_LABELS, PURPOSE_PRIORITY_WEIGHT, type PurposeId, type TripPurpose } from "@/lib/purposes";

/** PRD §7.3 목적 그룹화. 같은 그룹의 목적은 검색 의도가 겹치므로 쿼리를 하나로 합칩니다. */
export type PurposeGroup = "음식" | "휴양" | "관광" | "감성" | "체험" | "문화" | "소비" | "이벤트" | "야간";

const PURPOSE_GROUP_BY_ID: Record<PurposeId, PurposeGroup> = {
  food: "음식",
  healing: "휴양",
  nature: "관광",
  attraction: "관광",
  cafe: "감성",
  activity: "체험",
  culture: "문화",
  shopping: "소비",
  festival: "이벤트",
  nightlife: "야간",
};

export interface SearchPlan {
  /** 실제로 실시간 검색을 태울 쿼리 (기본 2~3개). */
  primaryQueries: string[];
  /** primaryQueries 결과가 너무 적을 때만 보충으로 태우는 쿼리 (최대 1개). */
  fallbackQueries: string[];
  purposeGroups: PurposeGroup[];
}

const MAX_PRIMARY_QUERIES = 3;

function groupWeight(purposes: TripPurpose[]): number {
  return Math.max(...purposes.map((p) => PURPOSE_PRIORITY_WEIGHT[p.priority]));
}

/** "자연·풍경" → "자연"처럼, 검색어로 자연스러운 앞 단어만 씁니다. */
function shortLabel(id: PurposeId): string {
  return PURPOSE_LABELS[id].split("·")[0];
}

/**
 * 일정 항목마다 개별 검색하는 대신, 여행 조건 전체를 2~3개의 넓은 쿼리로 압축합니다
 * (PRD §7). 목적 그룹 중 우선순위(priority)가 높은 것부터 대표 쿼리를 하나씩 만들고,
 * 나머지는 이후 항목별 매칭 단계(§15)에서 후보 풀을 나눠 쓰는 것으로 커버합니다.
 */
export function buildSearchPlan(request: TripRequest, destinationName: string): SearchPlan {
  const tripStyleQuery = `${destinationName} ${request.memberType}여행 ${request.nights}박${request.nights + 1}일`;

  const byGroup = new Map<PurposeGroup, TripPurpose[]>();
  for (const purpose of request.purposes) {
    const group = PURPOSE_GROUP_BY_ID[purpose.id];
    byGroup.set(group, [...(byGroup.get(group) ?? []), purpose]);
  }

  const orderedGroups = Array.from(byGroup.entries()).sort(
    ([, a], [, b]) => groupWeight(b) - groupWeight(a)
  );

  const purposeQueries = orderedGroups.slice(0, MAX_PRIMARY_QUERIES - 1).map(([, purposes]) => {
    const top = [...purposes].sort(
      (a, b) => PURPOSE_PRIORITY_WEIGHT[b.priority] - PURPOSE_PRIORITY_WEIGHT[a.priority]
    )[0];
    return `${destinationName} ${request.memberType}여행 ${shortLabel(top.id)}`;
  });

  const primaryQueries = Array.from(new Set([tripStyleQuery, ...purposeQueries])).slice(0, MAX_PRIMARY_QUERIES);

  return {
    primaryQueries,
    fallbackQueries: [`${destinationName} 여행 코스`],
    purposeGroups: orderedGroups.map(([group]) => group),
  };
}
