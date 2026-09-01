import { NextResponse } from "next/server";
import { fetchQueryCandidates } from "@/lib/itinerary";
import { prewarmPlans } from "@/lib/prewarm";
import { DESTINATIONS } from "@/lib/mock/destinations";

// 실사용 트래픽에 앞서 인기 여행지 검색 결과를 미리 캐시에 채워둡니다 (PRD §17). 사용자
// 요청과 똑같이 fetchQueryCandidates를 재사용하므로, 캐시가 이미 최신이면(30일 이내) 그냥
// 건너뛰고, YouTube 일일 쿼터가 이미 소진됐으면 자동으로 네이버/목업으로만 채워집니다 —
// 별도의 "여유 있을 때만" 판단 로직 없이도 원칙(§17)이 그대로 지켜집니다.
const TOP_DESTINATION_COUNT = 5;
const PREFETCH_PURPOSE_LABELS = ["맛집", "힐링"];

// 일정 뼈대 프리워밍이 순차 AI 생성 여러 건을 돌리므로 함수 실행 시간을 넉넉히 잡는다.
// 중간에 잘려도 그때까지 저장된 캐시는 유지되고 다음 실행에서 이어받는다.
export const maxDuration = 300;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const topDestinations = [...DESTINATIONS].sort((a, b) => b.popularity - a.popularity).slice(0, TOP_DESTINATION_COUNT);

  const results: { query: string; count: number; error?: string }[] = [];
  for (const destination of topDestinations) {
    const queries = [
      `${destination.name} 여행 코스`,
      ...PREFETCH_PURPOSE_LABELS.map((label) => `${destination.name} 여행 ${label}`),
    ];
    for (const query of queries) {
      try {
        const sources = await fetchQueryCandidates(query);
        results.push({ query, count: sources.length });
      } catch (error) {
        console.error(`prefetch failed for "${query}":`, error);
        results.push({ query, count: 0, error: String(error) });
      }
    }
  }

  // 검색 캐시 다음으로 일정 뼈대(itinerary_plan_cache)도 미리 채운다. 쿼터가 넉넉한 이 시점에
  // canonical 데모/상위 지역 요청의 AI 일정을 저장해 두면, 이후 무료 쿼터가 소진돼도 해당
  // 요청은 폴백 템플릿이 아니라 실제 AI 일정을 돌려준다(src/lib/prewarm.ts). 이미 캐시가 있으면
  // 건너뛰고, 일부가 실패해도 나머지는 계속 진행되며 다음 실행에서 재시도된다. 함수가 타임아웃
  // 되더라도 앞서 저장된 항목은 그대로 남는다.
  const planPrewarm = await prewarmPlans().catch((error) => {
    console.error("plan prewarm failed:", error);
    return [{ destination: "-", month: 0, status: "error" as const, error: String(error) }];
  });

  return NextResponse.json({ prefetchedQueries: results.length, results, planPrewarm });
}
