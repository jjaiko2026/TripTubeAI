import { auth } from "@clerk/nextjs/server";
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { buildTripChatSystemPrompt, updateTripDraftTool, type TripChatUIMessage } from "@/lib/trip-chat";
import { fastModel } from "@/lib/ai/model";
import { defaultTripRequest } from "@/lib/plan-defaults";
import type { TripRequest } from "@/lib/types";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

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
