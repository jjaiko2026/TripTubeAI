import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";
import type { ItinerarySummary } from "@/db/queries";
import { monthLabel, relativeTimeLabel } from "@/lib/format";
import { DeleteItineraryButton } from "@/components/plan/delete-itinerary-button";

/**
 * 로그인 사용자가 최근에 만든 일정을 카드로 다시 찾아갈 수 있게 보여줍니다.
 * 저장 기능/내 일정 목록이 따로 없어 뒤로가기 말고는 만든 일정을 다시 볼 방법이
 * 없었던 문제를 보완하는 용도라, 일정 만들기 진입점 바로 위에 둡니다.
 */
export function RecentItineraries({
  itineraries,
  showViewAllLink = true,
  heading = "최근 만든 일정",
}: {
  itineraries: ItinerarySummary[];
  /** /plan/mine("전체 보기" 페이지) 자신에서 재사용할 때는 자기 자신을 가리키는 링크가
   *  나오지 않도록 끈다. */
  showViewAllLink?: boolean;
  /** 빈 문자열이면 소제목 자체를 생략한다(/plan/mine처럼 페이지 H1이 이미 맥락을 설명할 때). */
  heading?: string;
}) {
  if (itineraries.length === 0) return null;

  return (
    <div className="mb-10">
      {(heading || showViewAllLink) && (
        <div className="mb-3 flex items-center justify-between">
          {heading && <h2 className="text-sm font-semibold text-muted-foreground">{heading}</h2>}
          {showViewAllLink && (
            <Link href="/plan/mine" className="text-xs text-primary hover:underline">
              전체 보기
            </Link>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {itineraries.map((itinerary) => (
          <div
            key={itinerary.id}
            className="group relative rounded-xl border bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <Link href={`/plan/result/${itinerary.id}`} className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 pr-6 font-medium">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{itinerary.destinationName}</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="text-xs text-muted-foreground">
                {itinerary.memberType} {itinerary.memberCount}명 · {itinerary.nights}박 {itinerary.nights + 1}일 ·{" "}
                {monthLabel(itinerary.month)}
              </p>
              <p className="text-xs text-muted-foreground">{relativeTimeLabel(itinerary.createdAt)}</p>
            </Link>
            <DeleteItineraryButton id={itinerary.id} className="absolute top-3 right-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
