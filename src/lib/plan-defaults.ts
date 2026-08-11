import type { TripRequest } from "@/lib/types";

export function defaultTripRequest(): TripRequest {
  return {
    destination: "제주도",
    region: "국내",
    memberType: "연인",
    memberCount: 2,
    nights: 3,
    month: new Date().getMonth() + 1,
    purposes: ["힐링", "맛집"],
  };
}
