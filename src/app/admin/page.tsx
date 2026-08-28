import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Compass, Eye, MousePointerClick, CalendarPlus, CheckCircle2, Star } from "lucide-react";
import { SheetsSyncPanel } from "@/components/dashboard/sheets-sync-panel";
import { KnowledgeSheetsSyncPanel } from "@/components/dashboard/knowledge-sheets-sync-panel";
import { getKnowledgeReviewProgress } from "@/db/knowledge-queries";
import { getPipelineBUsageStats, PIPELINE_B_TEST_USER_IDS } from "@/db/pipeline-b-events";
import { getAdminItineraryRows, getAdminUserRows } from "@/db/admin-queries";
import { formatNumber, relativeTimeLabel } from "@/lib/format";
import { isAdminUser } from "@/lib/admin";

// /places, /places/recommend, /places/plan과 동일한 3개 값 — 지역별 집계 표 라벨용.
const REGION_LABELS: Record<string, string> = {
  "KR-SEOUL-CITY": "서울",
  "KR-JEJU-JEJUSI": "제주시",
  "KR-JEJU-SEOGWIPO": "서귀포시",
};

function truncate(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default async function AdminPage({
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
  if (!isAdminUser(userId)) notFound();

  const [pipelineB, knowledgeProgress, requestRows, userRows, params] = await Promise.all([
    getPipelineBUsageStats(),
    getKnowledgeReviewProgress(),
    getAdminItineraryRows(200),
    getAdminUserRows(100),
    searchParams,
  ]);

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

  // 지역코드 × (추천 실행/일정 생성 요청/완성 일정) 피벗.
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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">관리자</h1>
        <p className="mt-1 text-muted-foreground">
          사용자 요청·일정 데이터와 Pipeline B 실사용 현황, 콘텐츠/지식 검수를 한곳에서 봅니다. 관리자만 접근할 수 있어요.
        </p>
        <Link href="/dashboard" className="mt-2 inline-block text-sm text-primary hover:underline">
          공개 대시보드(방문자·비용 차트) 보기 →
        </Link>
      </div>

      {sheetsMessage && (
        <div className="mb-6 rounded-lg border bg-accent/40 px-4 py-3 text-sm">{sheetsMessage}</div>
      )}

      {/* 사용자 요청 로그 — 요청 1건 = 1줄 */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>사용자 요청 로그</CardTitle>
            <Badge variant="secondary">최근 {requestRows.length}건</Badge>
          </div>
          <CardDescription>
            사용자가 입력한 여행 조건과 그 결과로 생성된 AI 일정, 작성된 후기를 요청 1건당 한 줄로 정리했어요.
            목적·요청사항은 줄여서 표시하며, 전체 내용은 각 줄의 <strong>일정 보기</strong>에서 확인할 수 있어요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requestRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">아직 생성된 일정이 없어요.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="whitespace-nowrap pb-2 pr-4 font-medium">요청 시각</th>
                    <th className="whitespace-nowrap pb-2 pr-4 font-medium">사용자</th>
                    <th className="whitespace-nowrap pb-2 pr-4 font-medium">목적지</th>
                    <th className="whitespace-nowrap pb-2 pr-4 font-medium">구성</th>
                    <th className="whitespace-nowrap pb-2 pr-4 font-medium">일정</th>
                    <th className="pb-2 pr-4 font-medium">목적</th>
                    <th className="pb-2 pr-4 font-medium">요청사항</th>
                    <th className="whitespace-nowrap pb-2 pr-4 font-medium">결과</th>
                    <th className="whitespace-nowrap pb-2 font-medium">후기</th>
                  </tr>
                </thead>
                <tbody>
                  {requestRows.map((r) => (
                    <tr key={r.id} className="border-b align-top last:border-0">
                      <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                        {r.createdAt.slice(0, 10)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs" title={r.userId ?? undefined}>
                        {r.userId ? `…${r.userId.slice(-6)}` : "비로그인"}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4">
                        {r.destinationName}
                        <span className="ml-1 text-xs text-muted-foreground">{r.region}</span>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4">
                        {r.memberType} {r.memberCount}명
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4">
                        {r.nights}박 · {r.month}월
                      </td>
                      <td className="py-2 pr-4" title={r.purposeLabels.join(", ")}>
                        {r.purposeLabels.length > 0 ? truncate(r.purposeLabels.join(", "), 24) : "—"}
                      </td>
                      <td className="max-w-[16rem] py-2 pr-4 text-muted-foreground" title={r.notes ?? undefined}>
                        {r.notes ? truncate(r.notes) : "—"}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4">
                        <Link href={`/plan/result/${r.id}`} className="text-primary hover:underline">
                          일정 보기
                        </Link>
                        <span className="ml-1 text-xs text-muted-foreground">
                          {r.dayCount}일 · {r.itemCount}곳
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2">
                        {r.review ? (
                          <span className="inline-flex items-center gap-1" title={r.review.title}>
                            <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                            {r.review.rating}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 사용자별 이용 현황 (Pipeline A — /plan 일정 생성 기준) */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>사용자별 이용 현황</CardTitle>
            <Badge variant="secondary">{userRows.length}명</Badge>
          </div>
          <CardDescription>
            로그인 사용자별로 일정을 몇 개 만들었는지, 어디를 가장 자주 계획했는지 집계했어요. 개인정보 노출을
            막기 위해 Clerk 프로필은 조회하지 않고 user id만 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">아직 로그인 사용자의 일정이 없어요.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="whitespace-nowrap pb-2 pr-4 font-medium">사용자</th>
                    <th className="whitespace-nowrap pb-2 pr-4 font-medium">일정 생성</th>
                    <th className="whitespace-nowrap pb-2 pr-4 font-medium">가장 자주 계획한 곳</th>
                    <th className="whitespace-nowrap pb-2 font-medium">최근 생성</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((u) => (
                    <tr key={u.userId} className="border-b last:border-0">
                      <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs" title={u.userId}>
                        …{u.userId.slice(-6)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4">{formatNumber(u.tripCount)}건</td>
                      <td className="py-2 pr-4">{u.topDestination}</td>
                      <td className="whitespace-nowrap py-2 text-muted-foreground">
                        {relativeTimeLabel(u.lastCreatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline B 실사용 현황 (실제 데이터) */}
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

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Knowledge 검수 시트</CardTitle>
          <CardDescription>
            AI가 추출한 여행 지식(video_knowledge)을 Google Sheets(KNOWLEDGE_REVIEW)로 내보내 PHASE 10-0
            계약(Q1~Q8)에 따라 검수하고, 시트에서 입력한 판정을 다시 불러와 반영해요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {knowledgeProgress && knowledgeProgress.total > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">검수 진행률</span>
                <span className="font-medium">
                  {formatNumber(knowledgeProgress.confirmed + knowledgeProgress.review)} / {formatNumber(knowledgeProgress.total)}
                </span>
              </div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-primary"
                  style={{ width: `${(knowledgeProgress.confirmed / knowledgeProgress.total) * 100}%` }}
                />
                <div
                  className="bg-primary/40"
                  style={{ width: `${(knowledgeProgress.review / knowledgeProgress.total) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                confirmed {formatNumber(knowledgeProgress.confirmed)} · review {formatNumber(knowledgeProgress.review)} · 미검수{" "}
                {formatNumber(knowledgeProgress.unverified)}
              </p>
            </div>
          )}
          <KnowledgeSheetsSyncPanel />
        </CardContent>
      </Card>
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
