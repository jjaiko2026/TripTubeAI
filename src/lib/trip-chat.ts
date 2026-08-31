import { tool, type InferUITool, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";
import { ALL_MEMBER_TYPES, type MemberType, type TripRequest } from "@/lib/types";
import { AMBIGUOUS_DESTINATIONS } from "@/lib/mock/destinations";
import { ALL_PURPOSE_IDS, MAX_CORE_PURPOSES, PURPOSE_LABELS, type PurposeId } from "@/lib/purposes";

// 모델 선택은 서버 전용 라우트(src/app/api/trip-chat/route.ts)에서 한다 — 이 모듈은 클라이언트
// 컴포넌트도 타입을 import하므로 provider SDK를 끌어들이지 않는다(PRD v3.0 §20).

export const updateTripDraftTool = tool({
  description:
    "대화에서 파악되거나 바뀐 여행 조건을 일정 입력 폼에 반영합니다. 이번 턴에 새로 알게 됐거나 변경된 필드만 채워서 호출하세요 (전체를 다시 보낼 필요 없음).",
  inputSchema: z.object({
    destination: z.string().min(1).optional().describe("여행지 (예: 제주도, 도쿄, 부산). 이름이 여러 지역과 겹칠 수 있으면 반드시 구체적인 지역명으로 확정해서 전달"),
    region: z.enum(["국내", "해외"]).optional().describe("여행 지역: 국내 또는 해외"),
    memberType: z.enum(ALL_MEMBER_TYPES as [MemberType, ...MemberType[]]).optional().describe("여행 구성원 유형"),
    memberCount: z.number().int().min(1).max(20).optional().describe("인원 수"),
    nights: z.number().int().min(0).max(30).optional().describe("숙박 일수 (박)"),
    month: z.number().int().min(1).max(12).optional().describe("여행 시기 (월, 1~12)"),
    purposes: z
      .array(
        z.object({
          id: z.enum(ALL_PURPOSE_IDS as [PurposeId, ...PurposeId[]]),
          priority: z.enum(["core", "important", "normal"]).describe(
            `이 목적이 사용자에게 얼마나 중요한지. core는 최대 ${MAX_CORE_PURPOSES}개까지만 지정 가능 (초과분은 important로).`
          ),
        })
      )
      .optional()
      .describe("여행 목적/테마 (복수 선택 가능, 목적마다 우선순위 포함). 매번 지금까지 파악된 전체 목록을 새로 보내세요."),
    notes: z
      .string()
      .optional()
      .describe(
        "사용자가 명시적으로 지정한 세부 요구사항을 정리한 전체 텍스트 (예: '2일차는 성산 근처로', " +
          "'우도는 꼭 포함', '흑돼지 맛집 저녁으로 넣어줘', '한라산은 빼줘'). 필드 하나당 값 하나가 아니라 " +
          "지금까지 파악된 요구사항 전체를 매번 새로 정리해서 보내세요(이전 요구사항도 빠뜨리지 말고 " +
          "포함시켜 누적) — 다른 필드처럼 이번 턴에 새로 안 바뀌었으면 아예 보내지 마세요."
      ),
  }),
  outputSchema: z.string(),
});

export type TripChatTools = {
  updateTripDraft: InferUITool<typeof updateTripDraftTool>;
};

export type TripChatUIMessage = UIMessage<never, UIDataTypes, TripChatTools>;

function describeAmbiguousDestinations(): string {
  return Object.entries(AMBIGUOUS_DESTINATIONS)
    .map(([key, options]) => `${key} → ${options.map((o) => o.label).join(" / ")}`)
    .join("; ");
}

function describePurposes(): string {
  return ALL_PURPOSE_IDS.map((id) => `${PURPOSE_LABELS[id]}(${id})`).join(", ");
}

export function buildTripChatSystemPrompt(currentDraft: TripRequest): string {
  return [
    "당신은 TripTube AI의 여행 플래너 챗봇입니다. 사용자와 자연스러운 한국어 대화를 통해 여행 조건을 파악해서, " +
      "화면 옆에 있는 일정 입력 폼을 실시간으로 채워주는 역할을 합니다.",
    "파악해야 할 항목은 폼의 필드와 정확히 대응합니다: 여행 지역(region, 국내/해외), 여행지(destination), 구성원 유형" +
      "(memberType), 인원 수(memberCount), 숙박 일수(nights), 여행 시기(month, 1~12월), 여행 목적/테마(purposes, 복수 선택), " +
      "그리고 세부 요구사항(notes, 자유 텍스트).",
    "사용자가 '2일차는 성산 근처로 해줘', '우도는 꼭 가고 싶어', '저녁은 흑돼지 맛집으로', '한라산은 빼줘'처럼 " +
      "특정 날짜의 지역을 지정하거나, 일정 전체의 지역/동선을 지정하거나, 꼭 포함하거나 빼고 싶은 관광지·식당· " +
      "활동을 구체적으로 언급하면, 이를 반드시 notes 필드에 정리해서 담으세요. 이런 요구사항은 최종 일정을 짤 때 " +
      "다른 조건보다 우선적으로 반영되니, 놓치지 말고 최대한 구체적으로 (날짜/지역/장소명을 명시해서) 적으세요.",
    `구성원 유형은 다음 중 하나여야 합니다: ${ALL_MEMBER_TYPES.join(", ")}.`,
    `여행 목적/테마는 다음 중에서 골라야 하며, 도구 호출 시에는 괄호 안의 영문 id로 전달하세요: ${describePurposes()}.`,
    `목적마다 사용자에게 얼마나 중요한지 priority(core/important/normal)도 함께 판단해서 전달하세요. ` +
      `"꼭", "제일", "가장 중요한" 같은 강조 표현이 있으면 core로, 그냥 언급만 하면 normal로 두고, core는 최대 ` +
      `${MAX_CORE_PURPOSES}개까지만 지정하세요 (그 이상 강조하면 important로).`,
    "목적지가 대한민국 국내인지 해외인지는 당신이 알고 있는 사실대로 region 필드도 함께 채우세요 (예: 하노이 → 해외).",
    `다음 지명은 이름만으로 어느 지역인지 특정할 수 없거나(광주/고성) 나라 단위라 범위가 너무 넓습니다: ` +
      `${describeAmbiguousDestinations()}. 사용자가 이런 이름(목록에 없는 다른 나라 이름 포함, 예: '중국')을 ` +
      "말하면, 폼이 실시간으로 반응하도록 일단 그 이름 그대로 destination에 반영해서 updateTripDraft를 " +
      "호출하세요 (예: '중국' → destination을 우선 '중국'으로 채움). destination을 비워두거나 도구 호출을 " +
      "미루지 마세요. 그런 다음 어느 도시로 갈지 자연스럽게 되물어서, 사용자가 구체적인 지역을 말하면 " +
      "destination을 그 이름으로 다시 갱신하세요 (예: '광주' → 물어본 뒤 '광주광역시' 또는 '경기 광주시'로 " +
      "확정, '베트남' → 물어본 뒤 '다낭'으로 확정). 위에 나온 도시들은 예시일 뿐이니, 사용자가 목록에 없는 " +
      "다른 구체적인 도시(예: '나트랑', '붕따우')를 직접 말하면 그 이름 그대로 destination에 반영하세요 — " +
      "목록에 있는 도시로 바꾸도록 유도하지 마세요.",
    `현재까지 폼에 채워진 값: ${JSON.stringify(currentDraft)}`,
    "한 번에 모든 걸 물어보지 말고, 자연스럽게 한두 개씩 물어보며 대화를 이어가세요. 이미 채워진 값이라도 사용자가 다른 " +
      "이야기를 하면 그에 맞게 갱신하세요.",
    "이번 턴에 새로 파악되거나 바뀐 정보가 하나라도 있으면 반드시 updateTripDraft 도구를 호출해서 그 필드만 전달하세요. " +
      "확실하지 않은 값은 도구로 보내지 말고 되물어보세요.",
    "중요: 응답 속도를 위해, 사용자에게 건넬 답변 문장을 반드시 먼저 출력하고 같은 턴에 이어서 updateTripDraft를 " +
      "호출하세요. 도구만 호출하고 답변 텍스트를 비워두지 마세요.",
    "목적지, 여행 지역, 구성원 유형, 인원 수, 숙박 일수, 여행 시기, 여행 목적이 충분히 모였다면, 폼이 채워졌으니 " +
      "오른쪽(또는 아래)에서 확인하고 필요하면 직접 수정한 뒤 'AI 여행 일정 만들기' 버튼을 눌러달라고 안내하세요.",
    "응답은 짧고 친근하게, 한국어로 작성하세요.",
  ].join("\n");
}
