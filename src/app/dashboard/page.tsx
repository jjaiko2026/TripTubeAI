import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Sparkles, MapPin, TrendingUp, Compass, Eye, MousePointerClick, CalendarPlus, CheckCircle2 } from "lucide-react";
import {
  DestinationCostChart,
  PurposePieChart,
  VisitsChart,
} from "@/components/dashboard/dashboard-charts";
import { SheetsSyncPanel } from "@/components/dashboard/sheets-sync-panel";
import { KnowledgeSheetsSyncPanel } from "@/components/dashboard/knowledge-sheets-sync-panel";
import { DESTINATION_COSTS, generateUsageStats, totalUsage } from "@/lib/mock/stats";
import { getDashboardData } from "@/db/queries";
import { getPipelineBUsageStats, PIPELINE_B_TEST_USER_IDS } from "@/db/pipeline-b-events";
import { formatNumber } from "@/lib/format";
import { isAdminUser } from "@/lib/admin";

// /places, /places/recommend, /places/plan과 동일한 3개 값 — 지역별 집계 표에 라벨을 붙이는
// 용도로만 쓴다(이 페이지 안에서만 필요해 공유 모듈로 뽑지 않음, 다른 페이지들과 동일 관례).
const REGION_LABELS: Record<string, string> = {
  "KR-SEOUL-CITY": "서울",
  "KR-JEJU-JEJUSI": "제주시",
  "KR-JEJU-SEOGWIPO": "서귀포시",
};

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
  const pipelineB = await getPipelineBUsageStats();
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

  // 지역코드 × (추천 실행/일정 생성 요청/완성 일정) 피벗. place_selected/place_detail_viewed는
  // regionCode를 남기지 않아(placeId 기준이라) 이 표에는 나타나지 않는다.
  const regionPivot = new Map<string, { recommend: number; planRequested: number; completed: number }>();
  for (const row of pipelineB.byRegion) {
    const entry = regionPivot.get(row.regionCode) ?? { recommend: 0, planRequested: 0, completed: 0 };
    if (row.eventType === "recommend_executed") entry.recommend += row.count;
    else if (row.eventType === "plan_generate_requested") entry.planRequested += row.count;
    else if (row.eventType === "itinerary_completed") entry.completed += row.count;
    regionPivot.set(row.regionCode, entry);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">서비스 대시보드</h1>
        <p className="mt-1 text-muted-foreground">
          최근 30일간의 방문자·일정 생성 현황과 여행지별 평균 비용을 확인해 보세요.
        </p>
      </div>

      <Card className="mb-8 border-primary/30">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Pipeline B 실사용 현황</CardTitle>
            <Badge variant="secondary">실제 데이터</Badge>
          </div>
          <CardDescription>
            지역 선택 → AI 추천(TourAPI + Knowledge) → 장소 선택 → AI 일정 생성 흐름에서{" "}
            <strong>로그인한 실제 사용자</strong>가 발생시킨 이벤트만{" "}
            <code className="text-xs">pipeline_b_events</code> 테이블에서 그대로 집계했어요(PHASE 13-5 정책 —
            비로그인 익명 조회는 서로 다른 방문자를 구분할 방법이 없어 집계에서 제외해요). 아래 숫자는 목업이
            아니며, Pipeline A(옛 유튜브/블로그 기반 일정 생성, <code className="text-xs">/plan/new</code>)의
            데이터는 이 표에 전혀 포함되지 않아요. 검증용 테스트 계정({PIPELINE_B_TEST_USER_IDS.length}개)의 기록도
            제외했어요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile icon={<Compass className="h-4 w-4" />} label="AI 추천 실행" value={formatNumber(pipelineB.recommendExecuted)} sub="/places/recommend 제출" />
            <StatTile icon={<Eye className="h-4 w-4" />} label="장소 상세 조회" value={formatNumber(pipelineB.placeDetailViewed)} sub="/places/[id] 방문" />
            <StatTile icon={<MousePointerClick className="h-4 w-4" />} label="장소 선택" value={formatNumber(pipelineB.placeSelected)} sub="일정에 장소 추가" />
            <StatTile icon={<CalendarPlus className="h-4 w-4" />} label="AI 일정 생성 요청" value={formatNumber(pipelineB.planGenerateRequested)} sub="/places/plan 제출" />
            <StatTile icon={<CheckCircle2 className="h-4 w-4" />} label="완성 일정" value={formatNumber(pipelineB.itineraryCompleted)} sub={`실사용자 ${formatNumber(pipelineB.distinctUsers)}명`} />
          </div>

          {regionPivot.size > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">지역</th>
                    <th className="pb-2 pr-4 font-medium">AI 추천 실행</th>
                    <th className="pb-2 pr-4 font-medium">일정 생성 요청</th>
                    <th className="pb-2 font-medium">완성 일정</th>
                  </tr>
                </thead>
                <tbody>
                  {[...regionPivot.entries()].map(([code, v]) => (
                    <tr key={code} className="border-b last:border-0">
                      <td className="py-2 pr-4">{REGION_LABELS[code] ?? code}</td>
                      <td className="py-2 pr-4">{formatNumber(v.recommend)}</td>
                      <td className="py-2 pr-4">{formatNumber(v.planRequested)}</td>
                      <td className="py-2">{formatNumber(v.completed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
