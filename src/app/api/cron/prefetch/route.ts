import { NextResponse } from "next/server";
import { fetchQueryCandidates } from "@/lib/itinerary";
import { DESTINATIONS } from "@/lib/mock/destinations";

// 실사용 트래픽에 앞서 인기 여행지 검색 결과를 미리 캐시에 채워둡니다 (PRD §17). 사용자
// 요청과 똑같이 fetchQueryCandidates를 재사용하므로, 캐시가 이미 최신이면(30일 이내) 그냥
// 건너뛰고, YouTube 일일 쿼터가 이미 소진됐으면 자동으로 네이버/목업으로만 채워집니다 —
// 별도의 "여유 있을 때만" 판단 로직 없이도 원칙(§17)이 그대로 지켜집니다.
const TOP_DESTINATION_COUNT = 5;
const PREFETCH_PURPOSE_LABELS = ["맛집", "힐링"];

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

  return NextResponse.json({ prefetchedQueries: results.length, results });
}
