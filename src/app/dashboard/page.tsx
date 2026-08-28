import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, MapPin, CalendarRange } from "lucide-react";
import {
  DestinationCostChart,
  PurposePieChart,
  GenerationTrendChart,
} from "@/components/dashboard/dashboard-charts";
import { DESTINATION_COSTS } from "@/lib/mock/stats";
import { getDashboardData } from "@/db/queries";
import { formatNumber } from "@/lib/format";

export default async function DashboardPage() {
  const dashboard = await getDashboardData(30);

  const last30dGenerated = dashboard.dailyGenerated.reduce((sum, d) => sum + d.count, 0);
  const topDestination = dashboard.topDestinations[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">서비스 대시보드</h1>
        <p className="mt-1 text-muted-foreground">
          최근 30일간의 일정 생성 현황과 여행지별 평균 비용을 확인해 보세요.
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          icon={<CalendarRange className="h-4 w-4" />}
          label="최근 30일 일정 생성"
          value={formatNumber(last30dGenerated)}
          sub={`오늘 ${formatNumber(dashboard.dailyGenerated[dashboard.dailyGenerated.length - 1]?.count ?? 0)}건`}
        />
        <StatTile
          icon={<Sparkles className="h-4 w-4" />}
          label="누적 일정 생성"
          value={formatNumber(dashboard.totalItineraries)}
          sub="서비스 시작 이후 전체"
        />
        <StatTile
          icon={<MapPin className="h-4 w-4" />}
          label="가장 인기 있는 여행지"
          value={topDestination?.destination ?? "데이터 없음"}
          sub={topDestination ? `생성 ${formatNumber(topDestination.count)}건` : "아직 생성된 일정이 없어요"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>일정 생성 추이</CardTitle>
            <CardDescription>최근 30일</CardDescription>
          </CardHeader>
          <CardContent>
            <GenerationTrendChart data={dashboard.dailyGenerated} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>여행 목적 비중</CardTitle>
            <CardDescription>생성된 일정 기준</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.purposeDistribution.length > 0 ? (
              <PurposePieChart data={dashboard.purposeDistribution} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                아직 생성된 일정이 부족해 통계를 보여드릴 수 없어요.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>여행지별 평균 여행 비용</CardTitle>
            <CardDescription>1인 1박 기준 (숙박+식비+활동비 평균)</CardDescription>
          </CardHeader>
          <CardContent>
            <DestinationCostChart data={DESTINATION_COSTS} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>인기 여행지 Top 5</CardTitle>
            <CardDescription>생성된 일정 건수 기준</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.topDestinations.length > 0 ? (
              dashboard.topDestinations.slice(0, 5).map((d, idx) => (
                <div key={d.destination} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {idx + 1}
                    </span>
                    {d.destination}
                  </span>
                  <span className="text-muted-foreground">{formatNumber(d.count)}건 생성</span>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                아직 생성된 일정이 없어요.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card hover>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
