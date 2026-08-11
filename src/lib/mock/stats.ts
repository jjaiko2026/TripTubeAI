import type { DestinationCost, UsageStatPoint } from "@/lib/types";
import { DESTINATIONS } from "@/lib/mock/destinations";
import { mulberry32, hashSeed } from "@/lib/mock/rng";

export const DESTINATION_COSTS: DestinationCost[] = DESTINATIONS.map((d) => ({
  destination: d.name,
  avgCostPerPersonPerNight: d.avgCostPerPersonPerNight,
  popularity: d.popularity,
})).sort((a, b) => b.popularity - a.popularity);

export function generateUsageStats(daysBack = 30): UsageStatPoint[] {
  const rng = mulberry32(hashSeed("usage-stats-v1"));
  const points: UsageStatPoint[] = [];
  const today = new Date();

  let baseVisits = 180;
  let baseGenerated = 40;

  for (let i = daysBack - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const weekday = date.getDay();
    const weekendBoost = weekday === 0 || weekday === 6 ? 1.35 : 1;

    baseVisits += Math.round((rng() - 0.4) * 20);
    baseVisits = Math.max(60, baseVisits);
    baseGenerated += Math.round((rng() - 0.45) * 8);
    baseGenerated = Math.max(10, baseGenerated);

    points.push({
      date: date.toISOString().slice(0, 10),
      visits: Math.round(baseVisits * weekendBoost),
      itinerariesGenerated: Math.round(baseGenerated * weekendBoost),
    });
  }

  return points;
}

export function totalUsage(points: UsageStatPoint[]) {
  return points.reduce(
    (acc, p) => ({
      visits: acc.visits + p.visits,
      itinerariesGenerated: acc.itinerariesGenerated + p.itinerariesGenerated,
    }),
    { visits: 0, itinerariesGenerated: 0 }
  );
}
