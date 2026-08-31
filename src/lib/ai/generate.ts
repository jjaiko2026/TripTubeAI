import { generateText } from "ai";

type AiModel = Parameters<typeof generateText>[0]["model"];

/**
 * models를 앞에서부터 순서대로 시도한다. 한 모델이 어떤 이유로든 실패하면(429/503, 잘못된
 * 모델명 등 구분하지 않는다) 다음 모델로 넘어가고, 전부 실패하면 마지막 오류를 그대로 던진다.
 * 던져진 오류는 기존 호출부(itinerary.ts / trip-tips.ts)의 결정론적 폴백이 받는다 —
 * 즉 이 헬퍼는 "회귀 없이 한 번 더 기회를 준다"만 담당한다.
 *
 * call은 모델 인스턴스를 받아 실제 generateText(...) 호출을 그대로 실행하는 클로저다. 이렇게
 * 두면 generateText의 제네릭(Output 스키마 등) 추론이 호출부에서 온전히 유지된다.
 */
export async function generateTextWithFallback<T>(
  models: AiModel[],
  call: (model: AiModel) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (const model of models) {
    try {
      return await call(model);
    } catch (error) {
      lastError = error;
      console.error("AI model attempt failed, trying next if any:", error);
    }
  }
  throw lastError;
}
