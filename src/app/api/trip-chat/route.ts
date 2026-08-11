import { auth } from "@clerk/nextjs/server";
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { buildTripChatSystemPrompt, TRIP_CHAT_MODEL, updateTripDraftTool, type TripChatUIMessage } from "@/lib/trip-chat";
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
    model: TRIP_CHAT_MODEL,
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
