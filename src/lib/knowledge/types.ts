/**
 * ATKB 여행 지식 계층 전용 타입. src/db/schema.ts의 신규 테이블(jsonb 컬럼) 타이핑에 쓰인다.
 * 기존 src/lib/types.ts(Itinerary용 타입)와는 별도 파일로 분리해, 기존 타입 파일을 건드리지
 * 않는다 (docs/DATA_SCHEMA_PROPOSAL.md, docs/IMPLEMENTATION_PHASES.md Phase 1-A).
 */

/** 해외: continent/country/region/city/district, 국내: nation/province/city_county_district/district */
export type RegionLevel =
  | "continent"
  | "country"
  | "region"
  | "city"
  | "district"
  | "nation"
  | "province"
  | "city_county_district";

export type DomesticOverseas = "domestic" | "overseas";

/** regions / places / travelCourses 공통 검수 상태 (docs/REGION_RULES.md §8) */
export type EntityStatus = "confirmed" | "review" | "excluded";

/** videos.status — 수집 파이프라인 단계 (docs/MIGRATION_PLAN.md, PRD §65) */
export type VideoPipelineStatus =
  | "discovered"
  | "filtered"
  | "classified"
  | "extracted"
  | "normalized"
  | "verified";

/** video_knowledge.status — AI 추출 지식의 신뢰 상태 (docs/KNOWLEDGE_EXTRACTION.md §5) */
export type KnowledgeStatus = "confirmed" | "review" | "unverified";

export type ExtractionMethod = "ai" | "manual";
export type Confidence = "high" | "medium" | "low";

/** videos.contentTypes — 하나의 영상이 여러 개를 가질 수 있다(다중 분류) */
export type ContentTypeId =
  | "tourism"
  | "food"
  | "accommodation"
  | "shopping"
  | "experience"
  | "nature"
  | "course"
  | "transport"
  | "travel_info"
  | "comprehensive";

/** video_knowledge.knowledgeType */
export type KnowledgeTypeId =
  | "place"
  | "food"
  | "accommodation"
  | "shopping"
  | "experience"
  | "transport"
  | "course"
  | "info";

/** place_relations.relationType */
export type RelationType =
  | "nearby"
  | "recommended_next"
  | "walking_route"
  | "transit_route"
  | "same_area"
  | "same_theme"
  | "meal_nearby"
  | "accommodation_nearby";

/** excluded_video.reason (docs/REGION_RULES.md, PRD §44) */
export type ExcludedVideoReason =
  | "MULTI_REGION"
  | "REGION_UNCLEAR"
  | "JEJU_DIRECTIONAL"
  | "OLDER_THAN_ONE_YEAR"
  | "DUPLICATE"
  | "IRRELEVANT"
  | "REVIEW_REQUIRED";

/**
 * video_knowledge.content — knowledgeType별로 실제 채워지는 필드가 다르며 전부 선택값이다.
 * 자유 jsonb라 향후 필드가 늘어나도(예: 자막 기반 추출 시 타임스탬프) 스키마 변경이 필요 없다
 * (docs/KNOWLEDGE_EXTRACTION.md §8 향후 확장 여지).
 */
export interface KnowledgeContent {
  summary: string;
  priceInfo?: string;
  hours?: string;
  tips?: string[];
  warnings?: string[];
}
