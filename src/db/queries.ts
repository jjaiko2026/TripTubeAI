import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { itineraries, reviews } from "@/db/schema";
import type { Itinerary, ItineraryDay, Purpose, Review } from "@/lib/types";

export async function saveItinerary(itinerary: Itinerary, userId: string | null) {
  const db = getDb();
  const [row] = await db
    .insert(itineraries)
    .values({
      userId,
      destination: itinerary.request.destination,
      destinationName: itinerary.destinationName,
      memberType: itinerary.request.memberType,
      memberCount: itinerary.request.memberCount,
      nights: itinerary.request.nights,
      month: itinerary.request.month,
      purposes: itinerary.request.purposes,
      days: itinerary.days,
      estimatedTotalCost: itinerary.estimatedTotalCost,
      currency: itinerary.currency,
    })
    .returning({ id: itineraries.id });
  return row.id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getItinerary(id: string): Promise<Itinerary | null> {
  if (!UUID_RE.test(id)) return null;

  const db = getDb();
  const [row] = await db.select().from(itineraries).where(eq(itineraries.id, id)).limit(1);
  if (!row) return null;

  return {
    request: {
      destination: row.destination,
      memberType: row.memberType as Itinerary["request"]["memberType"],
      memberCount: row.memberCount,
      nights: row.nights,
      month: row.month,
      purposes: row.purposes as Purpose[],
    },
    destinationName: row.destinationName,
    days: row.days as ItineraryDay[],
    estimatedTotalCost: row.estimatedTotalCost,
    currency: row.currency as Itinerary["currency"],
    generatedAt: row.createdAt.toISOString(),
  };
}

export async function getReviews(): Promise<Review[]> {
  const db = getDb();
  const rows = await db.select().from(reviews).orderBy(desc(reviews.createdAt));
  return rows.map((row) => ({
    id: row.id,
    author: row.author,
    destination: row.destination,
    rating: row.rating,
    title: row.title,
    content: row.content,
    tripMonth: row.tripMonth,
    nights: row.nights,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createReview(review: {
  userId: string | null;
  author: string;
  destination: string;
  rating: number;
  title: string;
  content: string;
  tripMonth: number;
  nights: number;
}) {
  const db = getDb();
  await db.insert(reviews).values(review);
}
