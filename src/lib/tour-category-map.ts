/**
 * TourAPI contentTypeId ↔ PurposeId 매핑. 실제 cat1/cat2/cat3 세분류는 쓰지 않고
 * contentTypeId(대분류)만으로 충분히 근사합니다 — 목적을 API 호출 수만큼 1:1로
 * 늘리지 않기 위함입니다.
 */
import type { PurposeId } from "@/lib/purposes";

export const TOUR_CONTENT_TYPE = {
  touristSpot: "12", // 관광지
  culturalFacility: "14", // 문화시설
  festival: "15", // 축제공연행사
  leisureSports: "28", // 레포츠
  shopping: "38", // 쇼핑
  restaurant: "39", // 음식점
} as const;

export const CONTENT_TYPE_TO_PURPOSES: Record<string, PurposeId[]> = {
  [TOUR_CONTENT_TYPE.touristSpot]: ["attraction", "nature"],
  [TOUR_CONTENT_TYPE.culturalFacility]: ["culture"],
  [TOUR_CONTENT_TYPE.festival]: ["festival"],
  [TOUR_CONTENT_TYPE.leisureSports]: ["activity"],
  [TOUR_CONTENT_TYPE.shopping]: ["shopping"],
  [TOUR_CONTENT_TYPE.restaurant]: ["food"],
};
