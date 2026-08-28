import type { DestinationCost } from "@/lib/types";
import { DESTINATIONS } from "@/lib/mock/destinations";

export const DESTINATION_COSTS: DestinationCost[] = DESTINATIONS.map((d) => ({
  destination: d.name,
  avgCostPerPersonPerNight: d.avgCostPerPersonPerNight,
  popularity: d.popularity,
})).sort((a, b) => b.popularity - a.popularity);
