import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { videoKnowledge, videos, regions } from "@/db/schema";
import type { KnowledgeTypeId, Confidence, KnowledgeContent } from "@/lib/knowledge/types";

// 프롬프트가 지나치게 커지지 않도록 하는 상한. content-sheet.ts의 MAX_EXPORT_QUERIES,
// itinerary.ts의 MAX_PLACE_SEARCH_QUERIES와 같은 취지의 안전 상한이다.
const MAX_REGIONAL_KNOWLEDGE_ITEMS = 10;

export interface RegionalKnowledgeItem {
  knowledgeType: KnowledgeTypeId;
  summary: string;
  confidence: Confidence;
  sourceReference: string;
}

/**
 * regionCode(regions.code)로 그 지역에 속한 영상들의 confirmed video_knowledge를 조회한다
 * (Phase 8-2 설계: region 기반 연결, placeId 불필요 — normalize-place 없이도 동작).
 * videoId 경로만 사용한다(sourceRefId/블로그 경로는 이번 범위 밖). placeId는 전혀 참조하지
 * 않는다. confirmed가 없으면(현재 운영 DB가 그렇다) 빈 배열을 반환해, 호출부가 Knowledge
 * 연결 이전과 완전히 동일하게 동작하도록 한다. DB 조회 자체가 실패하면 예외를 그대로
 * 던진다 — "데이터 없음"과 "조회 실패"를 같은 값(빈 배열)으로 뭉개지 않는다.
 */
export async function getConfirmedRegionalKnowledge(regionCode: string): Promise<RegionalKnowledgeItem[]> {
  const db = getDb();

  const rows = await db
    .select({
      knowledgeType: videoKnowledge.knowledgeType,
      content: videoKnowledge.content,
      confidence: videoKnowledge.confidence,
      sourceReference: videoKnowledge.sourceReference,
    })
    .from(videoKnowledge)
    .innerJoin(videos, eq(videoKnowledge.videoId, videos.videoId))
    .innerJoin(regions, eq(videos.regionId, regions.id))
    .where(
      and(
        eq(regions.code, regionCode),
        eq(videoKnowledge.status, "confirmed"),
        isNotNull(videoKnowledge.videoId)
      )
    )
    .orderBy(asc(videoKnowledge.createdAt))
    .limit(MAX_REGIONAL_KNOWLEDGE_ITEMS);

  return rows
    .filter((row) => {
      const content = row.content as KnowledgeContent | null;
      return !!content?.summary?.trim() && !!row.confidence && !!row.sourceReference?.trim();
    })
    .map((row) => ({
      knowledgeType: row.knowledgeType as KnowledgeTypeId,
      summary: (row.content as KnowledgeContent).summary.trim(),
      confidence: row.confidence as Confidence,
      sourceReference: (row.sourceReference as string).trim(),
    }));
}

// PHASE 12-1과 같은 상한 취지 — 지역당 노출되는 큐레이션 코스 수를 안전하게 제한한다.
const MAX_CONFIRMED_COURSES = 10;

export interface ConfirmedCourseKnowledgeItem {
  id: string;
  knowledgeType: KnowledgeTypeId; // 이 함수는 항상 "course"만 반환한다
  summary: string;
  confidence: Confidence; // 내부 참고용 — 화면에는 노출하지 않는다
  sourceReference: string;
  video: {
    videoId: string;
    title: string;
    videoUrl: string;
    thumbnailUrl: string | null;
  };
}

/**
 * regionCode로 그 지역 영상들의 confirmed & knowledgeType="course" video_knowledge를 조회한다.
 * getConfirmedRegionalKnowledge()와 동일한 region 기반 연결(placeId 불필요)이며, 사람이 검수를
 * 마친 여행 코스를 있는 그대로(재요약/재판정 없이) 사용자 화면에 노출하기 위한 용도다.
 * confirmed course가 없으면 빈 배열을 반환한다 — 호출부가 이를 오류가 아니라 "아직 없음"으로
 * 다루도록 한다.
 */
export async function getConfirmedRegionalCourses(regionCode: string): Promise<ConfirmedCourseKnowledgeItem[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: videoKnowledge.id,
      knowledgeType: videoKnowledge.knowledgeType,
      content: videoKnowledge.content,
      confidence: videoKnowledge.confidence,
      sourceReference: videoKnowledge.sourceReference,
      videoId: videos.videoId,
      title: videos.title,
      videoUrl: videos.videoUrl,
      thumbnailUrl: videos.thumbnailUrl,
    })
    .from(videoKnowledge)
    .innerJoin(videos, eq(videoKnowledge.videoId, videos.videoId))
    .innerJoin(regions, eq(videos.regionId, regions.id))
    .where(
      and(
        eq(regions.code, regionCode),
        eq(videoKnowledge.status, "confirmed"),
        eq(videoKnowledge.knowledgeType, "course"),
        isNotNull(videoKnowledge.videoId)
      )
    )
    .orderBy(asc(videoKnowledge.createdAt))
    .limit(MAX_CONFIRMED_COURSES);

  return rows
    .filter((row) => {
      const content = row.content as KnowledgeContent | null;
      return !!content?.summary?.trim();
    })
    .map((row) => ({
      id: row.id,
      knowledgeType: row.knowledgeType as KnowledgeTypeId,
      summary: (row.content as KnowledgeContent).summary.trim(),
      confidence: row.confidence as Confidence,
      sourceReference: (row.sourceReference ?? "").trim(),
      video: {
        videoId: row.videoId,
        title: row.title,
        videoUrl: row.videoUrl,
        thumbnailUrl: row.thumbnailUrl,
      },
    }));
}
