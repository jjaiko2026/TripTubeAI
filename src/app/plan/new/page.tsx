import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { TripPlanner } from "@/components/plan/trip-planner";
import { RecentItineraries } from "@/components/plan/recent-itineraries";
import { getItinerary, getRecentItinerariesForUser } from "@/db/queries";

export default async function PlanNewPage({
  searchParams,
}: {
  searchParams: Promise<{ editFrom?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/plan/example?login=required");
  }

  const { editFrom } = await searchParams;
  const [recentItineraries, editItinerary] = await Promise.all([
    getRecentItinerariesForUser(userId, 3),
    editFrom ? getItinerary(editFrom, userId) : Promise.resolve(null),
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
            몇 가지 조건만 알려주시면, 최근 1년 내 유튜브·블로그 정보를 분석해 일정을 짜드려요.
          </p>
        </div>
      </div>
      <TripPlanner initialValue={editItinerary?.request} />
    </div>
  );
}
