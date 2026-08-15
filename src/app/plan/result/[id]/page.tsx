import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RefreshCcw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItineraryView } from "@/components/itinerary/itinerary-view";
import { ItineraryPdfButton } from "@/components/itinerary/itinerary-pdf-button";
import { WriteReviewDialog } from "@/components/reviews/write-review-dialog";
import { getItinerary } from "@/db/queries";

export default async function PlanResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const itinerary = await getItinerary(id);
  if (!itinerary) notFound();

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
          />
          <Button render={<Link href="/plan/new" />} variant="outline" size="sm">
            <RefreshCcw className="h-4 w-4" /> 새 일정 만들기
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {itinerary.destinationName} 여행 일정이 완성됐어요
        </h1>
        <p className="mt-1 text-muted-foreground">
          유튜브 영상과 블로그 글을 분석해 추천 코스를 구성했어요. 항목마다 참고한 출처도 함께 확인하세요.
        </p>
      </div>

      <ItineraryView itinerary={itinerary} />

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
