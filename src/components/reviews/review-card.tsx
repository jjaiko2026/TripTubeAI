import { Star } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { monthLabel } from "@/lib/format";
import type { Review } from "@/lib/types";

export function ReviewCard({ review }: { review: Review }) {
  return (
    <Card hover>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <p className="font-medium">{review.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {review.author} · {review.destination} · {monthLabel(review.tripMonth)} {review.nights}박
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              className={`h-3.5 w-3.5 ${
                i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">{review.content}</p>
        <Badge variant="secondary" className="mt-3">
          {review.destination}
        </Badge>
      </CardContent>
    </Card>
  );
}
