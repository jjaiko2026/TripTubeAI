"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
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
import { ReviewCard } from "@/components/reviews/review-card";
import { REVIEWS } from "@/lib/mock/reviews";
import type { Review } from "@/lib/types";

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>(REVIEWS);
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    const review: Review = {
      id: `local-${Date.now()}`,
      author: String(formData.get("author") || "익명 여행자"),
      destination: String(formData.get("destination") || "미정"),
      rating: Number(formData.get("rating") || 5),
      title: String(formData.get("title") || "여행 후기"),
      content: String(formData.get("content") || ""),
      tripMonth: new Date().getMonth() + 1,
      nights: Number(formData.get("nights") || 1),
      createdAt: new Date().toISOString(),
    };
    setReviews((prev) => [review, ...prev]);
    setOpen(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">여행 후기</h1>
          <p className="mt-1 text-muted-foreground">
            TripTube AI로 일정을 짜고 실제 여행을 다녀온 분들의 이야기예요.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <PenLine className="h-4 w-4" /> 후기 작성하기
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <form action={handleSubmit}>
              <DialogHeader>
                <DialogTitle>여행 후기 작성</DialogTitle>
                <DialogDescription>
                  데모 화면에서는 이 브라우저 세션에만 임시로 표시됩니다.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="author">이름</Label>
                    <Input id="author" name="author" placeholder="홍길동" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="destination">여행지</Label>
                    <Input id="destination" name="destination" placeholder="제주도" required />
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
                    <Input id="nights" name="nights" type="number" min={0} max={30} defaultValue={2} required />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">등록하기</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </div>
  );
}
