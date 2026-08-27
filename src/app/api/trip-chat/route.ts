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
