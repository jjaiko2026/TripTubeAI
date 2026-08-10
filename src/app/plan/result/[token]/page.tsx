import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItineraryView } from "@/components/itinerary/itinerary-view";
import { decodeTripRequest, generateItinerary } from "@/lib/mock/itinerary";
import type { TripRequest } from "@/lib/types";

// 토큰(=조건)이 같으면 같은 결과이므로, 재방문/공유 시 유튜브·블로그 API를
// 다시 호출하지 않도록 토큰별로 1시간 캐시합니다.
const getCachedItinerary = unstable_cache(
  (token: string, request: TripRequest) => generateItinerary(request),
  ["plan-result-itinerary"],
  { revalidate: 3600 }
);

export default async function PlanResultPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const request = decodeTripRequest(token);
  if (!request) notFound();

  const itinerary = await getCachedItinerary(token, request);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <Button render={<Link href="/plan/new" />} variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" /> 조건 다시 입력
        </Button>
        <Button render={<Link href="/plan/new" />} variant="outline" size="sm">
          <RefreshCcw className="h-4 w-4" /> 새 일정 만들기
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {itinerary.destinationName} 여행 일정이 완성됐어요
        </h1>
        <p className="mt-1 text-muted-foreground">
          유튜브 영상과 블로그 글을 분석해 추천 코스를 구성했어요. 항목마다 참고한 출처도 함께 확인하세요.
        </p>
      </div>

      <ItineraryView itinerary={itinerary} />
    </div>
  );
}
