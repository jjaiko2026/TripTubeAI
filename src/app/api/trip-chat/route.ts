import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { buildTripChatSystemPrompt, updateTripDraftTool, type TripChatUIMessage } from "@/lib/trip-chat";
import { fastModel } from "@/lib/ai/model";
import { defaultTripRequest } from "@/lib/plan-defaults";
import type { TripRequest } from "@/lib/types";

export const maxDuration = 30;

// 일정 생성 자체가 비로그인 사용자도 가능하므로(plan/new/page.tsx) 조건을 채워주는
// 챗봇도 로그인 없이 동작해야 한다 — 이 체크가 비로그인 사용자의 챗봇을 401로 막고 있었다.
export async function POST(req: Request) {
  const { messages, currentDraft }: { messages: TripChatUIMessage[]; currentDraft?: TripRequest } = await req.json();

  const result = streamText({
    model: fastModel,
    // 챗봇 답변은 짧게 유지하는 게 규칙이라 상한을 둔다 — 긴 생성으로 응답이 늘어지는 걸 막는다.
    maxOutputTokens: 512,
    system: buildTripChatSystemPrompt(currentDraft ?? defaultTripRequest()),
    messages: await convertToModelMessages(messages),
    tools: {
      updateTripDraft: updateTripDraftTool,
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
