import type { GeoLocation, Region } from "@/lib/types";
import { geocodeGoogle, geocodeNaverPlace } from "@/lib/real/geocode";

export interface GeocodeProvider {
  readonly id: "naver" | "google";
  geocode(params: { destinationName: string; place: string }): Promise<GeoLocation | null>;
}

const naverGeocodeProvider: GeocodeProvider = {
  id: "naver",
  geocode({ destinationName, place }) {
    return geocodeNaverPlace(destinationName, place);
  },
};

const googleGeocodeProvider: GeocodeProvider = {
  id: "google",
  geocode({ destinationName, place }) {
    return geocodeGoogle(destinationName, place);
  },
};

/**
 * region만 보고 고르지만, 앞으로 판단 기준(국가, 기능 지원 여부 등)이 늘어나도 이 함수
 * 안에서만 처리하면 되도록 선택 지점을 한 곳으로 모아둔 것입니다.
 */
export function resolveGeocodeProvider(region: Region): GeocodeProvider {
  return region === "국내" ? naverGeocodeProvider : googleGeocodeProvider;
}
