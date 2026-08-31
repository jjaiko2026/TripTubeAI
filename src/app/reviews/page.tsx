import { auth } from "@clerk/nextjs/server";
import { getReviews } from "@/db/queries";
import { ReviewsClient } from "@/components/reviews/reviews-client";

export default async function ReviewsPage() {
  const { userId } = await auth();
  const reviews = await getReviews(userId);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <ReviewsClient initialReviews={reviews} currentUserId={userId} />
    </div>
  );
}
