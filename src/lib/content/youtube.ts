import { generateText, Output } from "ai";
import { z } from "zod";
import type { TravelContentBrief } from "./types";

const AI_MODEL = "anthropic/claude-sonnet-5";

const youtubeSchema = z.object({
  title: z.string(),
  hook: z.string().describe("영상 첫 10~15초 Hook 대사"),
  chapters: z.array(z.object({ title: z.string(), narration: z.string() })),
  description: z.string(),
  tags: z.array(z.string()),
});

/**
 * PRD-v2.6 draft §40 YouTube Long-form Agent. Blog를 그대로 읽지 않고 Brief에서 영상
 * 콘텐츠를 새로 구성한다. 대본까지만 생성하고 실제 영상 렌더링/업로드는 하지 않는다
 * (§40.4 — 생성과 발행 분리, 이 저장소엔 아직 영상 생성 Provider가 없음).
 */
export async function generateYouTubeScript(brief: TravelContentBrief): Promise<z.infer<typeof youtubeSchema>> {
  const { output } = await generateText({
    model: AI_MODEL,
    output: Output.object({ schema: youtubeSchema }),
    system:
      "당신은 TripTube AI의 YouTube 여행 영상 기획자입니다. Travel Content Brief로 Long-form 영상 " +
      "대본을 구성하세요. 구성: Hook → 여행 전체 소개 → 일차별 진행 → 예산/실용 정보 → 추천 대상 → CTA. " +
      "실제 일정과 일치해야 하고, 검증되지 않은 사실은 단정하지 마세요.",
    prompt: JSON.stringify(brief),
  });

  return output;
}
