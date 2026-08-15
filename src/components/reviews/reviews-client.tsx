"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewCard } from "@/components/reviews/review-card";
import { WriteReviewDialog } from "@/components/reviews/write-review-dialog";
import type { Review } from "@/lib/types";

export function ReviewsClient({ initialReviews }: { initialReviews: Review[] }) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews);

  return (
    <>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">여행 후기</h1>
          <p className="mt-1 text-muted-foreground">
            TripTube AI로 일정을 짜고 실제 여행을 다녀온 분들의 이야기예요.
          </p>
        </div>
        <WriteReviewDialog renderAs={<Button />} onCreated={(review) => setReviews((prev) => [review, ...prev])}>
          <PenLine className="h-4 w-4" /> 후기 작성하기
        </WriteReviewDialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </>
  );
}
