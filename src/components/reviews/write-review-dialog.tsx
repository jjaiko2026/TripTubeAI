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
import { createReviewAction } from "@/lib/actions";
import type { Review } from "@/lib/types";

/** 후기 작성 다이얼로그. /reviews 목록 페이지와 일정 결과 페이지 양쪽에서 재사용합니다. */
export function WriteReviewDialog({
  renderAs = <Button variant="outline" size="sm" />,
  children,
  defaultDestination,
  defaultNights,
  onCreated,
}: {
  renderAs?: ReactElement;
  children: ReactNode;
  defaultDestination?: string;
  defaultNights?: number;
  onCreated?: (review: Review) => void;
}) {
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
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
    });
    setOpen(false);
    void createReviewAction(formData);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={renderAs}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>여행 후기 작성</DialogTitle>
            <DialogDescription>다른 여행자들에게 도움이 되는 후기를 남겨주세요.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="author">이름</Label>
                <Input id="author" name="author" placeholder="홍길동" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="destination">여행지</Label>
                <Input
                  id="destination"
                  name="destination"
                  placeholder="제주도"
                  defaultValue={defaultDestination}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">제목</Label>
              <Input id="title" name="title" placeholder="정말 만족스러운 여행이었어요" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content">내용</Label>
              <Textarea id="content" name="content" rows={4} placeholder="여행은 어떠셨나요?" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rating">평점 (1~5)</Label>
                <Input id="rating" name="rating" type="number" min={1} max={5} defaultValue={5} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nights">숙박(박)</Label>
                <Input
                  id="nights"
                  name="nights"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={defaultNights ?? 2}
                  required
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">등록하기</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
