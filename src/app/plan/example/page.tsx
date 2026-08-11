import { Sparkles } from "lucide-react";
import { unstable_cache } from "next/cache";
import { SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { ItineraryView } from "@/components/itinerary/itinerary-view";
import { generateItinerary } from "@/lib/itinerary";
import type { TripRequest } from "@/lib/types";

const EXAMPLE_REQUEST: TripRequest = {
  destination: "제주도",
  memberType: "연인",
  memberCount: 2,
  nights: 3,
  month: 10,
  purposes: ["힐링", "맛집"],
};

// 비로그인 사용자 누구나 보는 공개 페이지라, 방문할 때마다 실제 유튜브/블로그
// API를 호출하지 않도록 1시간 단위로 캐시합니다 (API 쿼터 보호).
// Itinerary 데이터 구조가 바뀌면(예: source -> sources) 캐시 키를 올려서 이전
// 배포에서 캐시된 옛 모양의 데이터를 그대로 읽지 않도록 합니다.
const getExampleItinerary = unstable_cache(
  () => generateItinerary(EXAMPLE_REQUEST),
  ["plan-example-itinerary-v2"],
  { revalidate: 3600 }
);

export default async function PlanExamplePage() {
  const { userId } = await auth();
  const itinerary = await getExampleItinerary();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {!userId && (
        <div className="mb-8 flex flex-col items-center gap-3 rounded-xl border bg-accent/40 px-6 py-6 text-center">
          <Sparkles className="h-6 w-6 text-primary" />
          <p className="font-medium">
            지금 보시는 일정은 <span className="text-primary">예시 화면</span>입니다.
          </p>
          <p className="text-sm text-muted-foreground">
            로그인하면 원하는 여행지·기간·목적에 맞춘 나만의 일정을 직접 만들 수 있어요.
          </p>
          <SignInButton mode="redirect" forceRedirectUrl="/plan/new">
            <Button>로그인하고 내 일정 만들기</Button>
          </SignInButton>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          예시: {itinerary.destinationName} {EXAMPLE_REQUEST.nights}박 {EXAMPLE_REQUEST.nights + 1}일 일정
        </h1>
        <p className="mt-1 text-muted-foreground">
          연인과 함께, 힐링·맛집 위주로 요청했을 때 TripTube AI가 만들어주는 일정 예시입니다.
        </p>
      </div>

      <ItineraryView itinerary={itinerary} />
    </div>
  );
}
