import { TripForm } from "@/components/plan/trip-form";

export default function PlanNewPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          어떤 여행을 계획하고 계신가요?
        </h1>
        <p className="mt-2 text-muted-foreground">
          몇 가지 조건만 알려주시면, 최근 1년 내 유튜브·블로그 정보를 분석해 일정을 짜드려요.
        </p>
      </div>
      <TripForm />
    </div>
  );
}
