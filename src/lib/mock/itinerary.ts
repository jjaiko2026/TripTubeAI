import type { Itinerary, ItineraryDay, ItineraryItem, TripRequest } from "@/lib/types";
import { DESTINATIONS, findDestination, genericDestination, type ActivityTemplate } from "@/lib/mock/destinations";
import { mulberry32, hashSeed, seededShuffle } from "@/lib/mock/rng";
import { pickOneSource } from "@/lib/mock/sources";

const DAY_TIME_SLOTS = ["09:30", "12:00", "14:30", "17:00", "19:00"];

function requestSeedKey(request: TripRequest) {
  return [
    request.destination,
    request.memberType,
    request.memberCount,
    request.nights,
    request.month,
    request.purposes.join(","),
  ].join("::");
}

export function resolveDestination(name: string) {
  return findDestination(name) ?? genericDestination(name.trim() || "미정 여행지");
}

export function generateItinerary(request: TripRequest): Itinerary {
  const destination = resolveDestination(request.destination);
  const rng = mulberry32(hashSeed(requestSeedKey(request)));
  const days = Math.max(1, request.nights + 1);

  const purposeFilter = request.purposes.length > 0 ? request.purposes : undefined;

  const preferred: ActivityTemplate[] = purposeFilter
    ? destination.activities.filter((a) => a.tags.some((t) => purposeFilter.includes(t)))
    : destination.activities;
  const fallback: ActivityTemplate[] = destination.activities;

  const pool = seededShuffle(rng, preferred.length >= days * 3 ? preferred : [...preferred, ...fallback]);

  let poolIndex = 0;
  function nextActivity(): ActivityTemplate {
    if (poolIndex >= pool.length) poolIndex = 0;
    const item = pool[poolIndex % pool.length];
    poolIndex++;
    return item;
  }

  const itineraryDays: ItineraryDay[] = [];

  for (let day = 1; day <= days; day++) {
    const slotsForDay = day === days && days > 1 ? DAY_TIME_SLOTS.slice(0, 3) : DAY_TIME_SLOTS;
    const items: ItineraryItem[] = slotsForDay.map((time, idx) => {
      const activity = nextActivity();
      const query = `${destination.name} ${activity.title}`;
      const preferVideo = (hashSeed(query + idx) % 2) === 0;
      const source = pickOneSource(query, preferVideo);
      return {
        time,
        title: activity.title,
        description: activity.description,
        tags: activity.tags,
        source,
      };
    });

    itineraryDays.push({
      day,
      label: days === 1 ? "당일" : `Day ${day}`,
      items,
    });
  }

  const estimatedTotalCost =
    destination.avgCostPerPersonPerNight * Math.max(1, request.nights) * Math.max(1, request.memberCount);

  return {
    request,
    destinationName: destination.name,
    days: itineraryDays,
    estimatedTotalCost,
    currency: "KRW",
    generatedAt: new Date().toISOString(),
  };
}

export function encodeTripRequest(request: TripRequest): string {
  const json = JSON.stringify(request);
  return Buffer.from(json, "utf-8").toString("base64url");
}

export function decodeTripRequest(token: string): TripRequest | null {
  try {
    const json = Buffer.from(token, "base64url").toString("utf-8");
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || !parsed.destination) return null;
    return parsed as TripRequest;
  } catch {
    return null;
  }
}

export const POPULAR_DESTINATION_NAMES = DESTINATIONS.map((d) => d.name);
