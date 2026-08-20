"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, MapPin, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceCard } from "@/components/itinerary/source-card";
import { cn } from "@/lib/utils";
import type { ItineraryItem } from "@/lib/types";
import type { PlaceWithDetails } from "@/db/queries";
import { CONTENT_TYPE_LABEL } from "@/components/places/place-card";
import { removePlaceFromItineraryAction } from "@/lib/actions";
import { purposeLabel } from "@/lib/purposes";

/**
 * 일정 항목 하나를 펼치기/접기 가능한 카드로 표시합니다. indexInDay는 지도 핀 번호와
 * 동일한 값(같은 날 안에서 좌표가 있는 항목 순번)이라 목록과 지도의 번호가 서로 대응됩니다.
 *
 * item.placeId가 있으면(ITINERARY PLACE MANAGEMENT v1) TourAPI 장소로 추가된 항목이다.
 * 카테고리/주소/좌표 신뢰도는 JSON에 중복 저장하지 않고, 상위(ItineraryView)가
 * getPlaceById()로 조회한 place를 그대로 내려받아 표시만 한다.
 */
export function ItineraryItemCard({
  item,
  color,
  indexInDay,
  place,
  itineraryId,
  dayNumber,
  canManage,
}: {
  item: ItineraryItem;
  color: string;
  indexInDay: number | null;
  /** item.placeId로 조회된 TourAPI 장소(없으면 일반 AI 생성 항목). */
  place?: PlaceWithDetails;
  itineraryId: string;
  dayNumber: number;
  /** 삭제 폼을 보여줄지 여부(로그인한 뷰어에게만 — 실제 소유자 검증은 서버 액션에서 한 번 더 함). */
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = place?.externalContentTypeId ? CONTENT_TYPE_LABEL[place.externalContentTypeId] : undefined;

  return (
    <div className="overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        {indexInDay !== null ? (
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {indexInDay}
          </span>
        ) : (
          <span className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-medium text-muted-foreground">{item.time}</span>
            <p className="font-medium">{item.title}</p>
            {place && (
              <Badge variant="outline" className="text-[10px]">
                {typeLabel ?? "TourAPI 장소"}
              </Badge>
            )}
          </div>
          <p className={cn("mt-0.5 text-sm text-muted-foreground", !expanded && "line-clamp-1")}>
            {item.description}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t px-3 pb-3 pt-2 sm:pl-12">
          {place && (
            <div className="rounded-md border bg-muted/30 p-2.5 text-xs">
              {place.address && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {place.address}
                </p>
              )}
              <p className="mt-1 text-muted-foreground">
                {place.coordinateReliable ? "지도에 표시 가능한 위치예요." : "위치 정보 확인 중이라 지도에는 표시되지 않아요."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* fromItinerary로 어디서 왔는지 알려줘, 장소 상세의 뒤로가기가 일정으로
                    돌아가도록 한다(그전엔 항상 /places로 고정돼 있어 일정 컨텍스트가
                    끊겼었다). */}
                <Link
                  href={`/places/${item.placeId}?fromItinerary=${itineraryId}`}
                  className="text-primary hover:underline"
                >
                  장소 상세 페이지 보기
                </Link>
                {canManage && (
                  <form action={removePlaceFromItineraryAction}>
                    <input type="hidden" name="itineraryId" value={itineraryId} />
                    <input type="hidden" name="placeId" value={item.placeId} />
                    <input type="hidden" name="day" value={dayNumber} />
                    <Button type="submit" variant="ghost" size="xs" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                      일정에서 삭제
                    </Button>
                  </form>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[11px]">
                {purposeLabel(tag)}
              </Badge>
            ))}
          </div>
          {item.sources.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {item.sources.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
