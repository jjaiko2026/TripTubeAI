import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, MapPin, RefreshCcw, Star, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItineraryView } from "@/components/itinerary/itinerary-view";
import { ItineraryPdfButton } from "@/components/itinerary/itinerary-pdf-button";
import { WriteReviewDialog } from "@/components/reviews/write-review-dialog";
import { DeleteItineraryButton } from "@/components/plan/delete-itinerary-button";
import { getItinerary } from "@/db/queries";
import { monthLabel } from "@/lib/format";

export default async function PlanResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fallback?: string }>;
}) {
  const { id } = await params;
  // PHASE 3 — generateItinerary()의 usedFallback은 saveItinerary()에 저장되지 않는 휘발성
  // 신호라(§lib/types.ts), 생성 직후의 리다이렉트 쿼리로만 전달된다. 새로고침/재방문 시에는
  // 이 파라미터가 없어 배너가 다시 뜨지 않는다 — 의도된 동작(영구 표시가 아니라 그 순간의
  // 재시도 유도용).
  const { fallback } = await searchParams;
  const showFallbackNotice = fallback === "1";
  // 결과 페이지는 의도적으로 소유자 무관 공개 조회다(공유 링크 지원, src/db/queries.ts
  // getItinerary() 주석 참고) — 이 동작은 바꾸지 않는다. 일정 항목 삭제 UI를 보여줄지만
  // 별도로 소유자 일치 여부를 확인한다(같은 getItinerary()를 userId까지 넘겨 한 번 더 호출).
  const { userId } = await auth();
  const [itinerary, ownedItinerary] = await Promise.all([
    getItinerary(id),
    userId ? getItinerary(id, userId) : Promise.resolve(null),
  ]);
  if (!itinerary) notFound();
  const canManage = ownedItinerary !== null;

  const { request } = itinerary;
  const pdfTitle =
    `TripTubeAI와 함께하는 ${itinerary.destinationName} ${monthLabel(request.month)} ` +
    `${request.nights}박 ${request.nights + 1}일 여행 일정표`;
  // PHASE 1 — Pipeline B legacy 경로(장소 후보만으로 만든 일정)에는 실제로 분석하지 않은
  // YouTube/블로그 출처를 분석한 것처럼 표시하면 안 된다. 별도 컬럼 없이, 이미 저장된
  // item.sources(§lib/types.ts ItineraryItem)만으로 판단한다.
  const hasAnySourcedItem = itinerary.days.some((day) =>
    day.items.some((item) => item.sources && item.sources.length > 0)
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <Button render={<Link href={`/plan/new?editFrom=${id}`} />} variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" /> 조건 다시 입력
        </Button>
        <div className="flex items-center gap-2">
          <ItineraryPdfButton
            targetId="itinerary-printable"
            fileName={`${itinerary.destinationName}_여행일정.pdf`}
            title={pdfTitle}
          />
          {/* PHASE 2 최종 점검 — /places의 여행 Context 기능(§getPlacesTripContext)으로
              들어가는 유일한 진입점. 본인 일정에 장소를 "추가"하는 목적이라 공유 링크로
              들어온 비소유자에게는 보이지 않는다(DeleteItineraryButton과 동일하게 canManage로
              가드) — /places 쪽 context 로직 자체는 무수정, 여기서 링크만 새로 잇는다. */}
          {canManage && (
            <Button render={<Link href={`/places?itineraryId=${id}`} />} variant="outline" size="sm">
              <MapPin className="h-4 w-4" /> 장소 더 둘러보고 추가하기
            </Button>
          )}
          <Button render={<Link href="/plan/new" />} variant="outline" size="sm">
            <RefreshCcw className="h-4 w-4" /> 새 일정 만들기
          </Button>
          {canManage && <DeleteItineraryButton id={id} redirectTo="/plan/mine" />}
        </div>
      </div>

      {showFallbackNotice && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>일시적으로 AI 생성이 어려워 기본 템플릿으로 구성됐어요. 위 &apos;조건 다시 입력&apos;으로 다시 시도해 보세요.</p>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {itinerary.destinationName} 여행 일정이 완성됐어요
        </h1>
        <p className="mt-1 text-muted-foreground">
          {hasAnySourcedItem
            ? "유튜브 영상과 블로그 글을 분석해 추천 코스를 구성했어요. 항목마다 참고한 출처도 함께 확인하세요."
            : "AI가 선택한 장소 정보를 바탕으로 구성한 일정입니다."}
        </p>
      </div>

      <ItineraryView itinerary={itinerary} itineraryId={id} canManage={canManage} />

      <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border bg-muted/30 p-6 text-center">
        <p className="font-medium">이 일정이 마음에 드셨나요?</p>
        <p className="text-sm text-muted-foreground">
          다녀오신 후 다른 여행자들을 위해 후기를 남겨주세요.
        </p>
        <WriteReviewDialog
          renderAs={<Button />}
          defaultDestination={itinerary.destinationName}
          defaultNights={itinerary.request.nights}
        >
          <Star className="h-4 w-4" /> 후기 남기기
        </WriteReviewDialog>
      </div>
    </div>
  );
}
