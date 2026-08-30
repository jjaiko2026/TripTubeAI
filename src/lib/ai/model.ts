import { google } from "@ai-sdk/google";

/**
 * PRD v3.0 §20 — AI 제공자 추상화. 호출부(itinerary.ts / trip-tips.ts / trip-chat route)는
 * smartModel/fastModel만 import하고, 실제 제공자는 여기서만
 * 정한다. "provider/model" 문자열이 아니라 모델 인스턴스를 넘기므로 AI SDK가 별도 중계 계층
 * 없이 해당 제공자 API로 직접 호출한다.
 *
 * 현재 제공자: Google Gemini API 직결(@ai-sdk/google). GOOGLE_GENERATIVE_AI_API_KEY 환경변수를
 * 요청 시점에 읽는다 — aistudio.google.com에서 무료 발급, 무료 티어 존재(실제 quota/조건은
 * 공식 문서 기준). 키가 없거나 호출이 실패하면 각 호출부의 기존 폴백이 그대로 동작한다
 * (generateItineraryFallback, trip-tips 결정론적 안내, recommendPlaces 빈 배열 등).
 */

// gemini-3.6-flash: 이 API 키에서 사용 가능하고 무료 티어에 포함되는 현행 안정 모델(구조화
// 출력 검증됨). 일정 생성 품질을 더 올리려면 smartModel을 "gemini-3.7-flash"나
// "gemini-3.1-pro-preview"로 바꾸면 된다 — 단 무료 티어/안정성은 구현 시점 공식 문서로 확인.

/** 일정 생성·수정처럼 구조화된 멀티데이 JSON을 안정적으로 만들어야 하는 호출. */
export const smartModel = google("gemini-3.6-flash");

/** 대화/요약/목록에서 고르기처럼 창작이 아닌 가벼운 호출. */
export const fastModel = google("gemini-3.6-flash");
