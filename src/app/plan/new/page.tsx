import { auth } from "@clerk/nextjs/server";
import { TripPlanner } from "@/components/plan/trip-planner";
import { RecentItineraries } from "@/components/plan/recent-itineraries";
import { getItinerary, getRecentItinerariesForUser } from "@/db/queries";

export default async function PlanNewPage({
  searchParams,
}: {
  searchParams: Promise<{ editFrom?: string }>;
}) {
  // 비로그인도 일정을 만들어 결과까지 볼 수 있다(결과 페이지는 원래 소유자 무관 공개 조회).
  // 저장·내 일정·수정은 여전히 로그인 사용자만 — createItineraryAction이 userId ?? null로 처리한다.
  const { userId } = await auth();

  const { editFrom } = await searchParams;
  const [recentItineraries, editItinerary] = await Promise.all([
    userId ? getRecentItinerariesForUser(userId, 3) : Promise.resolve([]),
    editFrom && userId ? getItinerary(editFrom, userId) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <RecentItineraries itineraries={recentItineraries} />

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            어떤 여행을 계획하고 계신가요?
          </h1>
          <p className="mt-2 text-muted-foreground">
            몇 가지 조건만 알려주시면, 최근 유튜브·블로그 정보를 분석해 일정을 짜드려요.
          </p>
          {!userId && (
            <p className="mt-2 text-sm text-muted-foreground">
              로그인 없이 바로 만들어 볼 수 있어요. 로그인하면 만든 일정이 저장되고 나중에 수정할 수 있습니다.
            </p>
          )}
        </div>
      </div>
      {/* PHASE 6 — editItinerary가 null이면(id 없음/존재하지 않음/본인 소유 아님, getItinerary()가
          이미 (id, userId)로 확인함) editFromId도 undefined로 넘겨 "기존 일정 교체" 선택지 자체가
          아예 뜨지 않게 한다 — 소유권 확인을 페이지 레벨에서 한 번 더 보장. */}
      <TripPlanner initialValue={editItinerary?.request} editFromId={editItinerary ? editFrom : undefined} />
    </div>
  );
}
