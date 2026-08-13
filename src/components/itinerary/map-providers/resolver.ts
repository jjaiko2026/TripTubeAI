import type { Region } from "@/lib/types";
import type { MapProvider } from "@/components/itinerary/map-providers/types";
import { naverMapProvider } from "@/components/itinerary/map-providers/naver-map-provider";
import { googleMapProvider } from "@/components/itinerary/map-providers/google-map-provider";

/**
 * region만 보고 고르지만, 앞으로 provider가 늘어나거나(카카오맵 등) 판단 기준이 늘어나도
 * 이 함수 안에서만 처리하면 되도록 선택 지점을 한 곳으로 모아둔 것입니다.
 */
export function resolveMapProvider(region: Region): MapProvider {
  return region === "국내" ? naverMapProvider : googleMapProvider;
}
