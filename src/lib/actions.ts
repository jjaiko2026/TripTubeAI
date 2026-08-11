"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { generateItinerary } from "@/lib/mock/itinerary";
import { createReview, saveItinerary } from "@/db/queries";
import type { MemberType, Purpose, TripRequest } from "@/lib/types";

export async function createItineraryAction(formData: FormData) {
  const { userId } = await auth();

  const destination = String(formData.get("destination") ?? "").trim();
  const memberType = String(formData.get("memberType") ?? "혼자") as MemberType;
  const memberCount = Math.max(1, Number(formData.get("memberCount") ?? 1));
  const nights = Math.max(0, Number(formData.get("nights") ?? 2));
  const month = Math.min(12, Math.max(1, Number(formData.get("month") ?? new Date().getMonth() + 1)));
  const purposes = formData.getAll("purposes").map(String) as Purpose[];

  if (!destination) {
    redirect("/plan/new?error=destination");
  }

  const request: TripRequest = { destination, memberType, memberCount, nights, month, purposes };
  const itinerary = await generateItinerary(request);
  const id = await saveItinerary(itinerary, userId ?? null);
  redirect(`/plan/result/${id}`);
}

export async function createReviewAction(formData: FormData) {
  const { userId } = await auth();

  await createReview({
    userId: userId ?? null,
    author: String(formData.get("author") || "익명 여행자"),
    destination: String(formData.get("destination") || "미정"),
    rating: Math.min(5, Math.max(1, Number(formData.get("rating") || 5))),
    title: String(formData.get("title") || "여행 후기"),
    content: String(formData.get("content") || ""),
    tripMonth: new Date().getMonth() + 1,
    nights: Math.max(0, Number(formData.get("nights") || 1)),
  });

  revalidatePath("/reviews");
}
