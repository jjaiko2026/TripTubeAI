"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session";
import { encodeTripRequest } from "@/lib/mock/itinerary";
import type { MemberType, Purpose, TripRequest } from "@/lib/types";

export async function loginAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/plan/new");

  if (!name || !email) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const value = Buffer.from(JSON.stringify({ name, email }), "utf-8").toString("base64url");
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect(next || "/plan/new");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/");
}

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
