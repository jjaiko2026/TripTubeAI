"use server";

import { redirect } from "next/navigation";
import { encodeTripRequest } from "@/lib/mock/itinerary";
import type { MemberType, Purpose, TripRequest } from "@/lib/types";

export async function createItineraryAction(formData: FormData) {
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
  const token = encodeTripRequest(request);
  redirect(`/plan/result/${token}`);
}
