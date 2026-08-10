export type Purpose = "힐링" | "맛집" | "액티비티" | "문화·역사" | "쇼핑";

export const ALL_PURPOSES: Purpose[] = [
  "힐링",
  "맛집",
  "액티비티",
  "문화·역사",
  "쇼핑",
];

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
  memberType: MemberType;
  memberCount: number;
  nights: number;
  month: number;
  purposes: Purpose[];
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

export interface ItineraryItem {
  time: string;
  title: string;
  description: string;
  tags: Purpose[];
  source: Source;
}

export interface ItineraryDay {
  day: number;
  label: string;
  items: ItineraryItem[];
}

export interface Itinerary {
  request: TripRequest;
  destinationName: string;
  days: ItineraryDay[];
  estimatedTotalCost: number;
  currency: "KRW";
  generatedAt: string;
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
