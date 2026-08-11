import { tool, type InferUITool, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";
import { ALL_MEMBER_TYPES, ALL_PURPOSES, type MemberType, type Purpose, type TripRequest } from "@/lib/types";

export const TRIP_CHAT_MODEL = "google/gemini-3.6-flash";

export const updateTripDraftTool = tool({
  description:
    "대화에서 파악되거나 바뀐 여행 조건을 일정 입력 폼에 반영합니다. 이번 턴에 새로 알게 됐거나 변경된 필드만 채워서 호출하세요 (전체를 다시 보낼 필요 없음).",
  inputSchema: z.object({
    destination: z.string().min(1).optional().describe("여행지 (예: 제주도, 도쿄, 부산)"),
    memberType: z.enum(ALL_MEMBER_TYPES as [MemberType, ...MemberType[]]).optional().describe("여행 구성원 유형"),
    memberCount: z.number().int().min(1).max(20).optional().describe("인원 수"),
    nights: z.number().int().min(0).max(30).optional().describe("숙박 일수 (박)"),
    month: z.number().int().min(1).max(12).optional().describe("여행 시기 (월, 1~12)"),
    purposes: z.array(z.enum(ALL_PURPOSES as [Purpose, ...Purpose[]])).optional().describe("여행 목적/테마 (복수 선택 가능)"),
  }),
  outputSchema: z.string(),
});

export type TripChatTools = {
  updateTripDraft: InferUITool<typeof updateTripDraftTool>;
};

export type TripChatUIMessage = UIMessage<never, UIDataTypes, TripChatTools>;

export function buildTripChatSystemPrompt(currentDraft: TripRequest): string {
  return [
    "당신은 TripTube AI의 여행 플래너 챗봇입니다. 사용자와 자연스러운 한국어 대화를 통해 여행 조건을 파악해서, " +
      "화면 옆에 있는 일정 입력 폼을 실시간으로 채워주는 역할을 합니다.",
    "파악해야 할 항목은 폼의 필드와 정확히 대응합니다: 여행지(destination), 구성원 유형(memberType), 인원 수(memberCount), " +
      "숙박 일수(nights), 여행 시기(month, 1~12월), 여행 목적/테마(purposes, 복수 선택).",
    `구성원 유형은 다음 중 하나여야 합니다: ${ALL_MEMBER_TYPES.join(", ")}.`,
    `여행 목적/테마는 다음 중에서 골라야 합니다: ${ALL_PURPOSES.join(", ")}.`,
    `현재까지 폼에 채워진 값: ${JSON.stringify(currentDraft)}`,
    "한 번에 모든 걸 물어보지 말고, 자연스럽게 한두 개씩 물어보며 대화를 이어가세요. 이미 채워진 값이라도 사용자가 다른 " +
      "이야기를 하면 그에 맞게 갱신하세요.",
    "이번 턴에 새로 파악되거나 바뀐 정보가 하나라도 있으면 반드시 updateTripDraft 도구를 호출해서 그 필드만 전달하세요. " +
      "확실하지 않은 값은 도구로 보내지 말고 되물어보세요.",
    "목적지, 구성원 유형, 인원 수, 숙박 일수, 여행 시기, 여행 목적이 충분히 모였다면, 폼이 채워졌으니 오른쪽(또는 아래)에서 " +
      "확인하고 필요하면 직접 수정한 뒤 'AI 여행 일정 만들기' 버튼을 눌러달라고 안내하세요.",
    "응답은 짧고 친근하게, 한국어로 작성하세요.",
  ].join("\n");
}
