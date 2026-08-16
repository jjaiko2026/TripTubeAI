import { generateText, Output } from "ai";
import { z } from "zod";
import type { TravelContentBrief } from "./types";

const AI_MODEL = "anthropic/claude-sonnet-5";

const shortsSchema = z.object({
  shorts: z.array(
    z.object({
      title: z.string(),
      hook: z.string(),
      script: z.string(),
      hashtags: z.array(z.string()),
    })
  ),
});

/** PRD-v2.6 draft §41 Shorts Agent — Long-form을 자르지 않고 독립적인 짧은 주제를 추출한다. */
export async function generateShorts(brief: TravelContentBrief, shortCount: number) {
  const count = Math.min(10, Math.max(1, shortCount));

  const { output } = await generateText({
    model: AI_MODEL,
    output: Output.object({ schema: shortsSchema }),
    system:
      `당신은 TripTube AI의 Shorts 기획자입니다. Travel Content Brief에서 서로 다른 주제의 짧은 ` +
      `Shorts 콘텐츠를 정확히 ${count}개 뽑으세요. 각 Short는 독립적으로 이해 가능해야 하고, 강한 Hook과 ` +
      "명확한 메시지 하나만 가져야 합니다.",
    prompt: JSON.stringify(brief),
  });

  return output.shorts;
}
