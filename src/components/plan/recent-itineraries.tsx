import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";
import type { ItinerarySummary } from "@/db/queries";
import { monthLabel, relativeTimeLabel } from "@/lib/format";

/**
 * 로그인 사용자가 최근에 만든 일정을 카드로 다시 찾아갈 수 있게 보여줍니다.
 * 저장 기능/내 일정 목록이 따로 없어 뒤로가기 말고는 만든 일정을 다시 볼 방법이
 * 없었던 문제를 보완하는 용도라, 일정 만들기 진입점 바로 위에 둡니다.
 */
export function RecentItineraries({ itineraries }: { itineraries: ItinerarySummary[] }) {
  if (itineraries.length === 0) return null;

  return (
    <div className="mb-10">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">최근 만든 일정</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {itineraries.map((itinerary) => (
          <Link
            key={itinerary.id}
            href={`/plan/result/${itinerary.id}`}
            className="group flex flex-col gap-2 rounded-xl border bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <div className="flex items-center gap-1.5 font-medium">
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
        ))}
      </div>
    </div>
  );
}
