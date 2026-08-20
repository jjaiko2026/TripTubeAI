"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { addPlaceToItineraryAction } from "@/lib/actions";
import type { ItinerarySummary } from "@/db/queries";

/**
 * /places/[id] 상세 페이지 전용. WriteReviewDialog(src/components/reviews/write-review-dialog.tsx)
 * 와 동일한 패턴 — client Dialog + <form action={서버 액션}>.
 *
 * 날짜 선택(ITINERARY PLACE SCHEDULING v1): 선택한 일정의 nights+1(기존 PDF 제목 등
 * 여러 곳에서 이미 쓰는 관례, ItinerarySummary.nights)만큼 "N일차" 옵션을 만든다. 실제
 * 일정 전체(days 배열)를 추가로 조회하지 않고 요약 정보만으로 계산 — 새 쿼리 없음.
 * 날짜 Select는 itinerary 선택이 바뀔 때마다 key로 리마운트시켜 항상 1일차부터 다시
 * 고르게 한다(수동 상태 동기화 대신 React의 key 리셋 관용구 사용).
 */
export function AddToItineraryDialog({
  placeId,
  itineraries,
}: {
  placeId: string;
  itineraries: ItinerarySummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [itineraryId, setItineraryId] = useState(itineraries[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  if (itineraries.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/plan/new" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          일정을 먼저 만들어주세요
        </Link>
        <span className="text-xs text-muted-foreground">또는</span>
        <Link href="/places/plan" className="text-xs text-primary hover:underline">
          AI로 바로 일정 만들기
        </Link>
      </div>
    );
  }

  const selectedItinerary = itineraries.find((it) => it.id === itineraryId) ?? itineraries[0];
  const dayCount = Math.max(1, selectedItinerary.nights + 1);
  const dayOptions = Array.from({ length: dayCount }, (_, i) => i + 1);

  // 이전엔 void addPlaceToItineraryAction(formData)로 fire-and-forget 후 다이얼로그만
  // 닫아, 추가가 실제로 성공했는지 아무 피드백도 없이 /places/[id]에 그대로 남아있었다
  // (장소 상세 → 일정 상세로 이어지는 흐름이 끊김). 제출을 기다렸다가 해당 일정 결과
  // 페이지로 이동시켜 흐름을 이어준다 — addPlaceToItineraryAction 자체는 무수정.
  async function handleSubmit(formData: FormData) {
    const targetItineraryId = String(formData.get("itineraryId") ?? "");
    setSubmitting(true);
    await addPlaceToItineraryAction(formData);
    setOpen(false);
    setSubmitting(false);
    if (targetItineraryId) router.push(`/plan/result/${targetItineraryId}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <CalendarPlus className="h-4 w-4" />
            일정에 추가
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>일정에 추가</DialogTitle>
            <DialogDescription>이 장소를 추가할 일정과 날짜를 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <input type="hidden" name="placeId" value={placeId} />
            <div className="space-y-1.5">
              <Label htmlFor="itineraryId">추가할 일정</Label>
              <Select
                name="itineraryId"
                value={itineraryId}
                onValueChange={(value) => {
                  if (value) setItineraryId(value);
                }}
              >
                <SelectTrigger id="itineraryId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {itineraries.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.destinationName} · {it.nights}박 {it.memberType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="day">날짜</Label>
              <Select key={itineraryId} name="day" defaultValue="1">
                <SelectTrigger id="day" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dayOptions.map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {day}일차
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "추가하는 중..." : "추가하기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
