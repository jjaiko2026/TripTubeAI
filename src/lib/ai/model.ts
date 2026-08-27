import { google } from "@ai-sdk/google";

/**
 * PRD v3.0 §20 — AI 호출은 특정 유료 gateway(Vercel AI Gateway)에 종속되지 않는다.
 * "provider/model" 문자열 대신 여기서 만든 모델 인스턴스를 generateText/streamText의
 * model에 넘기면 AI SDK가 gateway를 거치지 않고 해당 제공자로 직결한다. 제공자를 바꾸려면
 * 이 파일만 고치면 된다(호출부는 smartModel/fastModel만 import).
 *
 * 현재 제공자: Google Gemini API 직결(@ai-sdk/google). GOOGLE_GENERATIVE_AI_API_KEY 환경변수를
 * 요청 시점에 읽는다 — aistudio.google.com에서 무료 발급, 무료 티어 존재(실제 quota/조건은
 * 공식 문서 기준). 키가 없거나 호출이 실패하면 각 호출부의 기존 폴백이 그대로 동작한다
 * (generateItineraryFallback, trip-tips 결정론적 안내, recommendPlaces 빈 배열 등).
 */

/** 일정 생성·수정처럼 구조화된 멀티데이 JSON을 안정적으로 만들어야 하는 호출. */
export const smartModel = google("gemini-2.5-flash");

/** 대화/요약/목록에서 고르기처럼 창작이 아닌 가벼운 호출. */
export const fastModel = google("gemini-2.0-flash");
