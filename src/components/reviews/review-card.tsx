import Link from "next/link";
import { Pencil, Star } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WriteReviewDialog } from "@/components/reviews/write-review-dialog";
import { monthLabel } from "@/lib/format";
import type { Review } from "@/lib/types";

export function ReviewCard({
  review,
  canEdit = false,
  onUpdated,
}: {
  review: Review;
  /** 본인이 쓴 후기일 때만 true — 수정 버튼을 노출한다. */
  canEdit?: boolean;
  onUpdated?: (review: Review) => void;
}) {
  return (
    <Card hover>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <p className="font-medium">{review.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {review.author} · {review.destination} · {monthLabel(review.tripMonth)} {review.nights}박
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${
                  i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          {canEdit && (
            <WriteReviewDialog
              renderAs={<Button variant="ghost" size="icon-sm" aria-label="후기 수정" />}
              editReview={review}
              onUpdated={onUpdated}
            >
              <Pencil className="h-3.5 w-3.5" />
            </WriteReviewDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">{review.content}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{review.destination}</Badge>
          {review.itineraryId && (
            <Link
              href={`/plan/result/${review.itineraryId}`}
              className="text-xs text-primary hover:underline"
            >
              이 후기의 일정 보기 →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
