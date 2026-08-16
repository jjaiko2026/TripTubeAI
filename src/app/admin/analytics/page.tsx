/**
 * PRD(v2.6 draft) §54 KPI 구성을 참고하되, 이 저장소엔 아직 search_jobs 같은 세분화된
 * 큐 계측이 없어(search_locks/api_rate_limits 수준) 실측 가능한 지표와 목표치를 구분해 보여준다.
 */
import { getDashboardData } from "@/db/queries";
import { StatCard } from "@/components/admin/stat-card";

export default async function AdminAnalyticsPage() {
  const dashboard = await getDashboardData(30);
  const totalGenerated = dashboard.dailyGenerated.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">분석</h1>
        <p className="mt-1 text-muted-foreground">최근 30일 기준 실측 지표.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">여행 KPI (실측)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="최근 30일 일정 생성" value={totalGenerated} />
          <StatCard label="인기 여행지 1위" value={dashboard.topDestinations[0]?.destination ?? "-"} />
          <StatCard label="인기 목적 1위" value={dashboard.purposeDistribution[0]?.name ?? "-"} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">검색/인프라 KPI (목표치)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="YouTube Cache Hit Rate" value="≥ 70%" />
          <StatCard label="캐시로 완전 처리되는 요청" value="≥ 50%" />
          <StatCard label="일정 1건 평균 search.list" value="≤ 1.5회" />
          <StatCard label="동일 검색 동시 중복 호출" value="= 0건" />
          <StatCard label="API quota 초과 실패율" value="< 1%" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">TourAPI / 콘텐츠 KPI (도입 예정)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="TourAPI Cache Hit Rate" value="≥ 70%" hint="TourAPI 연동 후 계측" />
          <StatCard label="콘텐츠 생성 Job 완료율" value="-" hint="Content AI 연동 후 계측" />
          <StatCard label="콘텐츠 검수 통과율" value="-" hint="Content AI 연동 후 계측" />
        </div>
      </section>
    </div>
  );
}
