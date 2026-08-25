export type { PurposeId, TripPurpose, PurposePriority } from "@/lib/purposes";
import type { PurposeId, TripPurpose } from "@/lib/purposes";

export type MemberType = "혼자" | "친구" | "가족" | "연인" | "동료";

export const ALL_MEMBER_TYPES: MemberType[] = [
  "혼자",
  "친구",
  "가족",
  "연인",
  "동료",
];

export interface TripRequest {
  destination: string;
  region: Region;
  memberType: MemberType;
  memberCount: number;
  nights: number;
  month: number;
  purposes: TripPurpose[];
  /** 특정 날짜의 지역 지정, 꼭 가고 싶은 장소/맛집 등 사용자가 명시한 요청사항 (자유 텍스트) */
  notes: string;
}

export interface SourceVideo {
  kind: "youtube";
  id: string;
  title: string;
  channelName: string;
  query: string;
  publishedLabel: string;
  durationLabel: string;
  url: string;
  thumbnailUrl?: string;
  description?: string;
}

export interface SourceBlog {
  kind: "blog";
  id: string;
  title: string;
  snippet: string;
  siteName: string;
  publishedLabel: string;
  url: string;
}

export type Source = SourceVideo | SourceBlog;

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface ItineraryItem {
  time: string;
  title: string;
  description: string;
  tags: PurposeId[];
  sources: Source[];
  location: GeoLocation | null;
  /** TourAPI places.id 참조(uuid). "장소를 일정에 추가" 기능(TOUR PLACE → ITINERARY)으로
   *  생긴 항목에만 있다 — TourAPI 원본 데이터를 중복 저장하지 않고 참조만 남긴다. AI가
   *  직접 생성한 기존 항목에는 없다(옵셔널, 이 필드가 생기기 전 저장된 일정도 그대로 유효). */
  placeId?: string;
}

export interface ItineraryDay {
  day: number;
  label: string;
  /** 순서도 박스용 2~6글자 핵심 키워드. 이 필드가 생기기 전에 저장된 일정에는 없을 수 있습니다. */
  shortLabel?: string;
  items: ItineraryItem[];
}

export type Region = "국내" | "해외";

export interface TripTips {
  /** 여행 시기 기후 요약 (1~2문장) */
  climate: string;
  /** 그 기후에 맞는 준비물 목록 */
  packingList: string[];
  /** 해외 여행지의 최근 주요 이슈/유의사항. 국내 여행지면 빈 배열. */
  recentIssues: string[];
  /** PHASE 7 — AI 호출이 실패해 월/지역 기반 결정론적 안내로 대체됐을 때만 true.
   *  generateTripTips()가 EMPTY_TIPS 대신 이 값을 채운 fallback을 반환할 때 설정한다.
   *  Itinerary.usedFallback(PHASE 3)과 달리 tripTips는 itineraries.tripTips jsonb에 그대로
   *  실려 저장된다 — generateItinerary()를 수정하지 않고는 이 필드만 쏙 빼서 휘발성으로
   *  만들 방법이 없고, 저장돼도 스키마 변경이나 부작용이 없어 그대로 둔다. */
  usedFallback?: boolean;
}

export interface Itinerary {
  request: TripRequest;
  destinationName: string;
  region: Region;
  days: ItineraryDay[];
  estimatedTotalCost: number;
  currency: "KRW";
  generatedAt: string;
  tripTips: TripTips;
  /** PHASE 3 — AI 생성이 두 번 다 실패해 결정론적 fallback plan을 썼을 때만 true. 이 요청/
   *  리다이렉트 안에서만 쓰는 휘발성 신호로, saveItinerary()가 읽지 않아 DB에는 저장되지
   *  않는다(스키마 변경 없음). 정상 AI 생성 경로는 이 필드를 아예 설정하지 않는다. */
  usedFallback?: boolean;
}

export interface Review {
  id: string;
  author: string;
  destination: string;
  rating: number;
  title: string;
  content: string;
  tripMonth: number;
  nights: number;
  createdAt: string;
}

export interface DestinationCost {
  destination: string;
  avgCostPerPersonPerNight: number;
  popularity: number;
}

export interface UsageStatPoint {
  date: string;
  visits: number;
  itinerariesGenerated: number;
}
