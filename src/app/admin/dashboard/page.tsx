import { getAdminSummary } from "@/db/admin-queries";
import { StatCard } from "@/components/admin/stat-card";
import { formatNumber } from "@/lib/format";

export default async function AdminDashboardPage() {
  const summary = await getAdminSummary();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">관리자 대시보드</h1>
        <p className="mt-1 text-muted-foreground">서비스 이용 현황을 한눈에 확인하세요.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="누적 일정 생성" value={formatNumber(summary.totalItineraries)} />
        <StatCard label="이용 사용자" value={formatNumber(summary.distinctUsers)} />
        <StatCard label="누적 후기" value={formatNumber(summary.totalReviews)} />
        <StatCard label="오늘 YouTube 호출" value={formatNumber(summary.youtubeQuotaToday)} hint="search.list 기준" />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        여행지·목적 분포는 <a href="/admin/analytics" className="text-primary hover:underline">분석 페이지</a>,
        일정 목록은 <a href="/admin/itineraries" className="text-primary hover:underline">여행 일정 페이지</a>에서 확인하세요.
      </p>
    </div>
  );
}
