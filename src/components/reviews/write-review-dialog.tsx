"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createReviewAction, updateReviewAction } from "@/lib/actions";
import type { Review } from "@/lib/types";

/**
 * 후기 작성/수정 다이얼로그. /reviews 목록 페이지와 일정 결과 페이지 양쪽에서 재사용합니다.
 * editReview가 넘어오면 그 후기를 수정하는 모드로 동작합니다(본인 후기일 때만 노출).
 */
export function WriteReviewDialog({
  renderAs = <Button variant="outline" size="sm" />,
  children,
  defaultDestination,
  defaultNights,
  itineraryId,
  editReview,
  onCreated,
  onUpdated,
}: {
  renderAs?: ReactElement;
  children: ReactNode;
  defaultDestination?: string;
  defaultNights?: number;
  /** 일정 결과 페이지에서 열렸으면 그 일정 id — 후기를 그 일정에 연결한다. */
  itineraryId?: string;
  /** 넘어오면 이 후기를 수정하는 모드가 된다. */
  editReview?: Review;
  onCreated?: (review: Review) => void;
  onUpdated?: (review: Review) => void;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(editReview);

  function handleSubmit(formData: FormData) {
    if (editReview) {
      onUpdated?.({
        ...editReview,
        author: String(formData.get("author") || "익명 여행자"),
        destination: String(formData.get("destination") || "미정"),
        rating: Number(formData.get("rating") || 5),
        title: String(formData.get("title") || "여행 후기"),
        content: String(formData.get("content") || ""),
        nights: Number(formData.get("nights") || 1),
      });
      setOpen(false);
      void updateReviewAction(formData);
      return;
    }

    onCreated?.({
      id: `local-${Date.now()}`,
      author: String(formData.get("author") || "익명 여행자"),
      destination: String(formData.get("destination") || "미정"),
      rating: Number(formData.get("rating") || 5),
      title: String(formData.get("title") || "여행 후기"),
      content: String(formData.get("content") || ""),
      tripMonth: new Date().getMonth() + 1,
      nights: Number(formData.get("nights") || 1),
      createdAt: new Date().toISOString(),
      itineraryId: itineraryId ?? null,
    });
    setOpen(false);
    void createReviewAction(formData);
  }

  const nightsDefault = editReview?.nights ?? defaultNights ?? 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={renderAs}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form action={handleSubmit}>
          {editReview && <input type="hidden" name="id" value={editReview.id} />}
          {itineraryId && !isEdit && <input type="hidden" name="itineraryId" value={itineraryId} />}
          <DialogHeader>
            <DialogTitle>{isEdit ? "여행 후기 수정" : "여행 후기 작성"}</DialogTitle>
            <DialogDescription>다른 여행자들에게 도움이 되는 후기를 남겨주세요.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="author">이름</Label>
                <Input
                  id="author"
                  name="author"
                  placeholder="홍길동"
                  defaultValue={editReview?.author}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="destination">여행지</Label>
                <Input
                  id="destination"
                  name="destination"
                  placeholder="제주도"
                  defaultValue={editReview?.destination ?? defaultDestination}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">제목</Label>
              <Input
                id="title"
                name="title"
                placeholder="정말 만족스러운 여행이었어요"
                defaultValue={editReview?.title}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content">내용</Label>
              <Textarea
                id="content"
                name="content"
                rows={4}
                maxLength={1000}
                className="max-h-[35vh]"
                placeholder="여행은 어떠셨나요? (최대 1000자)"
                defaultValue={editReview?.content}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rating">평점 (1~5)</Label>
                <Input
                  id="rating"
                  name="rating"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={editReview?.rating ?? 5}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nights">숙박(박)</Label>
                <Input
                  id="nights"
                  name="nights"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={nightsDefault}
                  required
                />
              </div>
            </div>
            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="totalCost">1인 총 경비 (원, 선택)</Label>
                <Input id="totalCost" name="totalCost" type="number" min={0} step={10000} placeholder="예: 600000" />
                <p className="text-xs text-muted-foreground">
                  입력하면 대시보드의 여행지별 평균 비용에 반영됩니다.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="submit">{isEdit ? "수정 완료" : "등록하기"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
