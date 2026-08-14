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
}

export interface ItineraryDay {
  day: number;
  label: string;
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
