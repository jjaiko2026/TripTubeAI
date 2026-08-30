import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, RefreshCcw, Sparkles, Star, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItineraryView } from "@/components/itinerary/itinerary-view";
import { NearbyPlacesSection } from "@/components/plan/nearby-places-section";
import { ItineraryPdfButton } from "@/components/itinerary/itinerary-pdf-button";
import { ShareItineraryButton } from "@/components/plan/share-itinerary-button";
import { WriteReviewDialog } from "@/components/reviews/write-review-dialog";
import { DeleteItineraryButton } from "@/components/plan/delete-itinerary-button";
import { getItinerary } from "@/db/queries";
import { monthLabel } from "@/lib/format";

// getItinerary()는 React cache()로 감싸져 있어(§db/queries.ts) 아래 페이지 컴포넌트가
// 같은 id로 다시 호출해도 같은 요청 안에서는 DB를 한 번만 조회한다.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const itinerary = await getItinerary(id);
  if (!itinerary) return {};

  const { request } = itinerary;
  const title = `${itinerary.destinationName} ${monthLabel(request.month)} ${request.nights}박 ${request.nights + 1}일 여행 일정 | TripTube AI`;
  const description = `AI가 유튜브·블로그를 분석해 만든 ${itinerary.destinationName} 여행 일정을 확인해 보세요.`;

  return {
    title,
    description,
    // openGraph/twitter는 부모(layout.tsx) 메타데이터와 병합되지 않고 통째로 대체되므로,
    // 여기서 지우면 안 되는 site 전역 필드(type/locale/siteName, twitter card 종류)를 그대로 반복한다.
    openGraph: { type: "website", locale: "ko_KR", siteName: "TripTube AI", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PlanResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fallback?: string; revise?: string }>;
}) {
  const { id } = await params;
  // PHASE 3 — generateItinerary()의 usedFallback은 saveItinerary()에 저장되지 않는 휘발성
  // 신호라(§lib/types.ts), 생성 직후의 리다이렉트 쿼리로만 전달된다. 새로고침/재방문 시에는
  // 이 파라미터가 없어 배너가 다시 뜨지 않는다 — 의도된 동작(영구 표시가 아니라 그 순간의
  // 재시도 유도용).
  const { fallback, revise } = await searchParams;
  const showFallbackNotice = fallback === "1";
  // PRD v3.0 §16 — 일정 수정(reviseItineraryDayAction) 직후의 1회성 결과 알림.
  const reviseNotice = revise === "failed" ? "failed" : revise === "done" ? "done" : null;
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
  // item.sources(§lib/types.ts ItineraryItem)만으로 판단한다. PRD v3.0 §13 — YouTube/블로그
  // 출처가 없어도 관광공사·검수된 여행 지식(item.placeId)이 근거로 붙는 경우는 따로 구분한다.
  const hasAnySourcedItem = itinerary.days.some((day) =>
    day.items.some((item) => item.sources && item.sources.length > 0)
  );
  const hasReferencedPlace = itinerary.days.some((day) =>
    day.items.some((item) => Boolean(item.placeId))
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ShareItineraryButton title={pdfTitle} />
          <ItineraryPdfButton
            targetId="itinerary-printable"
            fileName={`${itinerary.destinationName}_여행일정.pdf`}
            title={pdfTitle}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button render={<Link href={`/plan/new?editFrom=${id}`} />} variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" /> 조건 다시 입력
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button render={<Link href="/plan/new" />} variant="outline" size="sm">
              <RefreshCcw className="h-4 w-4" /> 새 일정 만들기
            </Button>
            {canManage && <DeleteItineraryButton id={id} redirectTo="/plan/mine" />}
          </div>
        </div>
      </div>

      {showFallbackNotice && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>일시적으로 AI 생성이 어려워 기본 템플릿으로 구성됐어요. 위 &apos;조건 다시 입력&apos;으로 다시 시도해 보세요.</p>
        </div>
      )}

      {reviseNotice === "failed" && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>일정을 수정하지 못했어요. 잠시 후 다시 시도해 주세요. 기존 일정은 그대로 유지됐어요.</p>
        </div>
      )}
      {reviseNotice === "done" && (
        <div className="mb-6 rounded-xl border bg-accent/40 px-4 py-3 text-sm">
          <p>요청하신 날짜를 다시 구성했어요.</p>
        </div>
      )}

      <div className="mb-6">
        <p className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-primary uppercase">
          <Sparkles className="h-4 w-4" /> AI 여행 일정 완성
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          {itinerary.destinationName}, 이렇게 다녀오세요
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          {hasAnySourcedItem
            ? "유튜브 영상과 블로그 글을 분석해 추천 코스를 구성했어요. 항목마다 참고한 출처도 함께 확인하세요."
            : hasReferencedPlace
              ? "한국관광공사·검수된 여행 지식을 참고해 장소를 골랐어요. 항목마다 참고자료를 함께 확인하세요."
              : "AI가 선택한 장소 정보를 바탕으로 구성한 일정입니다."}
        </p>
      </div>

      <ItineraryView itinerary={itinerary} itineraryId={id} canManage={canManage} />

      <NearbyPlacesSection itineraryId={id} nights={request.nights} canManage={canManage} />

      <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-primary/20 bg-accent/40 p-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm shadow-primary/25">
          <Star className="h-5 w-5 fill-current" />
        </span>
        <p className="font-semibold">이 일정으로 다녀오실 건가요?</p>
        <p className="text-sm text-muted-foreground">
          다녀오신 후 다른 여행자들을 위해 후기를 남겨주세요.
        </p>
        <WriteReviewDialog
          renderAs={<Button />}
          defaultDestination={itinerary.destinationName}
          defaultNights={itinerary.request.nights}
          itineraryId={id}
        >
          <Star className="h-4 w-4" /> 후기 남기기
        </WriteReviewDialog>
      </div>
    </div>
  );
}
