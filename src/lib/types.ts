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
  /** 대표 메뉴/입장료 등 대략적인 예상 가격(예: "1인 12,000원~", "입장료 5,000원"). AI가
   *  확신 있게 추정할 수 있을 때만 채우는 참고용 값이라 없을 수 있다(옵셔널). */
  priceHint?: string;
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
  /** AI 생성이 두 번 다 실패하고 성공 캐시(itinerary_plan_cache)도 없어 결정론적 fallback
   *  plan을 썼을 때만 true. itineraries.used_fallback 컬럼에 저장되며(조회 시 null→false),
   *  결과 페이지가 "지금 다시 생성" CTA를 계속 띄우는 신호로 쓴다. 정상 생성/캐시 재사용
   *  경로는 false. */
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
  /** 이 후기가 작성된 일정 결과의 id(있으면). 일정이 삭제/재생성돼도 후기는 유지되므로 FK는 걸지 않는다. */
  itineraryId?: string | null;
}

export interface DestinationCost {
  destination: string;
  avgCostPerPersonPerNight: number;
  popularity: number;
}

/** "이 지역 더 둘러보기" — places 카탈로그가 아니라 일정과 같은 방식(AI)으로 생성한다.
 *  분류는 여행 목적(PURPOSE_LABELS)과 동일한 taxonomy를 그대로 쓴다. */
export const NEARBY_PLACE_CATEGORIES = [
  "맛집·미식",
  "휴양·힐링",
  "자연·풍경",
  "관광·명소",
  "카페·감성",
  "액티비티·체험",
  "문화·역사",
  "쇼핑",
  "축제·공연·이벤트",
  "야경·나이트라이프",
] as const;

export type NearbyPlaceCategory = (typeof NEARBY_PLACE_CATEGORIES)[number];

export interface NearbyPlace {
  name: string;
  category: NearbyPlaceCategory;
  /** 왜 가볼 만한지 한 문장. */
  reason: string;
  /** 대략적인 동네/구역 (있으면). */
  area: string | null;
  /** 그 여행지의 대표성 + 여행 목적 부합도. 정확도 높은 순으로 앞에 배치하는 데 쓴다.
   *  이 필드가 생기기 전 캐시된 항목에는 없을 수 있어(옵셔널) 그 경우 "medium"으로 취급한다. */
  relevance?: "high" | "medium" | "low";
}

/** nearby_places_cache에 목적지 단위로 저장되는 값. */
export interface NearbyPlacesResult {
  places: NearbyPlace[];
}
