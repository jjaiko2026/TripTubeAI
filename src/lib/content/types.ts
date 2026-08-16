import { z } from "zod";

/** PRD-v2.6 draft §38 Travel Content Brief — Blog/YouTube/Shorts가 공유하는 단일 사실 기준. */
export const travelContentBriefSchema = z.object({
  title: z.string().describe("이 여행 콘텐츠 전체를 관통하는 제목 후보"),
  targetAudience: z.string().describe("이 여행 콘텐츠가 가장 도움이 될 독자/시청자 (예: '아이 동반 3040 가족')"),
  coreStory: z.string().describe("이 여행의 핵심 스토리를 2~3문장으로"),
  keyPlaces: z.array(z.string()).describe("일정에서 콘텐츠 관점으로 특히 중요한 장소 목록"),
  keyExperiences: z.array(z.string()).describe("이 여행에서 강조할 만한 경험/활동 포인트"),
  verifiedFacts: z
    .array(z.object({ place: z.string(), fact: z.string(), verified: z.boolean() }))
    .describe(
      "장소별 검증 가능한 사실(운영시간/입장료/예약 여부 등). 확실하지 않으면 verified=false로 " +
        "표시하고, 사실을 지어내지 마세요."
    ),
  travelDesirePoints: z
    .array(z.object({ place: z.string(), whyVisit: z.string(), bestFor: z.string() }))
    .describe("장소별로 왜 가야 하는지, 누구에게 좋은지"),
  tone: z.string().describe("콘텐츠 전반의 톤앤매너 (예: '친근하고 실용적인 정보 전달')"),
  contentAngles: z.array(z.string()).describe("Blog/YouTube/Shorts로 확장할 때 쓸 수 있는 콘텐츠 앵글 후보"),
});

export type TravelContentBrief = z.infer<typeof travelContentBriefSchema>;

export const editorialGuardSchema = z.object({
  passed: z.boolean(),
  issues: z
    .array(
      z.object({
        type: z.enum(["copied_text", "mimicked_style", "factual_error", "overclaim", "ad_like"]),
        description: z.string(),
      })
    )
    .describe("발견된 문제만 나열. 없으면 빈 배열."),
});

export type EditorialGuardResult = z.infer<typeof editorialGuardSchema>;

export type ContentJobOptions = {
  blog?: boolean;
  youtube?: boolean;
  shorts?: boolean;
  shortCount?: number;
};

export type ContentJobStatus = "queued" | "researching" | "generating" | "review_required" | "failed";
