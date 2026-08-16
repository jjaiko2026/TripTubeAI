import { generateText, Output } from "ai";
import { editorialGuardSchema, type EditorialGuardResult } from "./types";

const AI_MODEL = "anthropic/claude-sonnet-5";

/**
 * PRD-v2.6 draft §39.7 Editorial / Copyright Guard — 외부 문장 복사, 특정 콘텐츠 문체
 * 모방, 사실 오류, 과장·광고성 표현을 점검한다. 확정 판정이 아니라 관리자 검수를
 * 돕는 신호이며, passed=false여도 콘텐츠 자체는 저장하고 관리자가 직접 판단하게 한다.
 */
export async function runEditorialGuard(content: string): Promise<EditorialGuardResult> {
  const { output } = await generateText({
    model: AI_MODEL,
    output: Output.object({ schema: editorialGuardSchema }),
    system:
      "당신은 콘텐츠 검수자입니다. 다음 콘텐츠에서 외부 문장 복사, 특정 블로그/영상 문체 모방, " +
      "사실 오류, 과장 또는 광고성 표현을 점검하세요. 심각한 문제가 없으면 passed=true.",
    prompt: content,
  });

  return output;
}
