import { generateText, Output } from "ai";
import { z } from "zod";
import type { TravelContentBrief } from "./types";

const AI_MODEL = "anthropic/claude-sonnet-5";

const blogSchema = z.object({
  title: z.string(),
  slug: z.string().describe("영문 소문자/하이픈으로만 구성된 URL slug"),
  markdown: z.string().describe("여행 전체 매력, 일정 한눈에 보기, DAY별 상세, 장소별 포인트, FAQ, 마무리를 포함한 Markdown 본문"),
});

/** PRD-v2.6 draft §39.6 Blog Writer. */
export async function generateBlogContent(brief: TravelContentBrief): Promise<z.infer<typeof blogSchema>> {
  const { output } = await generateText({
    model: AI_MODEL,
    output: Output.object({ schema: blogSchema }),
    system:
      "당신은 TripTube AI의 여행 블로그 작가입니다. 주어진 Travel Content Brief로 여행 블로그 글을 " +
      "한국어 Markdown으로 작성하세요. 구성: 제목, 여행 전체 매력, 일정 한눈에 보기, DAY별 상세, " +
      "장소별 여행 포인트, 여행 준비 정보, 추천 대상, FAQ, 마무리. 검증되지 않은 사실(verified=false)은 " +
      "단정하지 말고 '확인 필요'로 표시하세요. 외부 문장을 그대로 옮기지 말고 직접 새로 쓰세요.",
    prompt: JSON.stringify(brief),
  });

  return output;
}
