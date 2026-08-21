import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Sparkles, MapPin, TrendingUp } from "lucide-react";
import {
  DestinationCostChart,
  PurposePieChart,
  VisitsChart,
} from "@/components/dashboard/dashboard-charts";
import { SheetsSyncPanel } from "@/components/dashboard/sheets-sync-panel";
import { KnowledgeSheetsSyncPanel } from "@/components/dashboard/knowledge-sheets-sync-panel";
import { DESTINATION_COSTS, generateUsageStats, totalUsage } from "@/lib/mock/stats";
import { getDashboardData } from "@/db/queries";
import { formatNumber } from "@/lib/format";
import { isAdminUser } from "@/lib/admin";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    sheets?: string;
    count?: string;
    approved?: string;
    rejected?: string;
    updated?: string;
    skipped?: string;
    issues?: string;
  }>;
}) {
  const { userId } = await auth();
  const dashboard = await getDashboardData(30);
  const params = await searchParams;
  const sheetsMessage =
    params.sheets === "exported"
      ? `CONTENT_MASTER 시트로 ${params.count}개 항목을 내보냈어요.`
      : params.sheets === "imported"
        ? `승인 ${params.approved}건, 거부 ${params.rejected}건을 반영했어요.`
        : params.sheets === "knowledge-exported"
          ? `KNOWLEDGE_REVIEW 시트로 ${params.count}개 항목을 내보냈어요.`
          : params.sheets === "knowledge-imported"
            ? `검수 반영 ${params.updated}건, 미입력 ${params.skipped}건${Number(params.issues) > 0 ? `, 확인 필요 ${params.issues}건(중복/형식오류 등)` : ""}.`
            : params.sheets === "error"
              ? "시트 연동 중 오류가 발생했어요. 환경변수와 시트 공유 설정을 확인해주세요."
              : null;

  // 방문자 수는 아직 실제 이벤트 트래킹이 없어 목업이지만, 일정 생성 건수는
  // itineraries 테이블에서 집계한 실제 값으로 대체합니다.
  const dailyGeneratedByDate = new Map(dashboard.dailyGenerated.map((d) => [d.date, d.count]));
  const usage = generateUsageStats(30).map((point) => ({
    ...point,
    itinerariesGenerated: dailyGeneratedByDate.get(point.date) ?? 0,
  }));
  const totals = totalUsage(usage);
  const last = usage[usage.length - 1];

  const topDestination = dashboard.topDestinations[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">서비스 대시보드</h1>
        <p className="mt-1 text-muted-foreground">
          최근 30일간의 방문자·일정 생성 현황과 여행지별 평균 비용을 확인해 보세요.
        </p>
      </div>

      {sheetsMessage && (
        <div className="mb-6 rounded-lg border bg-accent/40 px-4 py-3 text-sm">{sheetsMessage}</div>
      )}

      {isAdminUser(userId) && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>콘텐츠 검수 시트</CardTitle>
            <CardDescription>
              캐시된 유튜브/블로그 소스를 Google Sheets(CONTENT_MASTER)로 내보내 검수하고, 시트에서 표시한
              승인·거부를 다시 불러와 일정 생성에 반영해요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SheetsSyncPanel />
          </CardContent>
        </Card>
      )}

      {isAdminUser(userId) && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Knowledge 검수 시트</CardTitle>
            <CardDescription>
              AI가 추출한 여행 지식(video_knowledge)을 Google Sheets(KNOWLEDGE_REVIEW)로 내보내 PHASE 10-0
              계약(Q1~Q8)에 따라 검수하고, 시트에서 입력한 판정을 다시 불러와 반영해요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KnowledgeSheetsSyncPanel />
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label="최근 30일 방문자"
          value={formatNumber(totals.visits)}
          sub={`오늘 ${formatNumber(last.visits)}명`}
        />
        <StatTile
          icon={<Sparkles className="h-4 w-4" />}
          label="일정 생성 실행 횟수"
          value={formatNumber(totals.itinerariesGenerated)}
          sub={`오늘 ${formatNumber(last.itinerariesGenerated)}건 · 누적 ${formatNumber(dashboard.totalItineraries)}건`}
        />
        <StatTile
          icon={<MapPin className="h-4 w-4" />}
          label="가장 인기 있는 여행지"
          value={topDestination?.destination ?? "데이터 없음"}
          sub={topDestination ? `생성 ${formatNumber(topDestination.count)}건` : "아직 생성된 일정이 없어요"}
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="평균 전환율"
          value="22.4%"
          sub="방문 대비 일정 생성"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>방문자 · 일정 생성 추이</CardTitle>
            <CardDescription>최근 30일 (일정 생성은 실제 집계)</CardDescription>
          </CardHeader>
          <CardContent>
            <VisitsChart data={usage} />
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
