# TripTube AI — 제품 요구사항 문서 (PRD) v3.0

| 항목 | 내용 |
|---|---|
| 프로젝트명 | TripTube AI |
| 네이밍 유래 | Trip + YouTube + AI |
| 한 줄 정의 | 사용자가 자연어로 여행 요구를 말하면, AI가 여행지·장소·이동 동선을 해석해 실제 일정으로 만들어 주고, 각 일정지마다 신뢰할 수 있는 참고자료를 붙여 주는 여행 일정 생성 서비스 |
| 배포 링크 | https://triptube-ai.vercel.app |
| 팀명 | AI tour |
| 문서 버전 | **v3.0 (2026-08-27)** |
| 이전 버전 | v2.5 (2026-08-15) — git 히스토리에 보존. §24, §13 참고 |
| v3.0 핵심 전환 | 제품의 최상위 관점을 "검색·수집·데이터 파이프라인"에서 **"사용자의 한 문장 → 완성된 여행 일정"** 이라는 사용자 경험으로 되돌린다. 이미 만들어진 자산(Pipeline A 일정 생성기, TourAPI/Knowledge, 지도 Provider, 검토 파이프라인)을 버리지 않고 하나의 흐름으로 잇는다. |

> **작성 원칙:** 모든 요구사항에 "제출 시 TripTube AI가 무엇을 하는 서비스인지 사용자에게 보여주는 데 직접 필요한가?"를 적용한다. YES → MVP(§21). NO → Post-MVP(§22) 또는 Out of Scope(§26).

---

## 1. Product Overview

TripTube AI는 여행자가 "어디로, 누구와, 언제, 어떤 스타일로" 가고 싶은지를 자연어 한두 문장으로 표현하면, 그 요구를 해석해 **여행 지역과 장소를 선정하고, 장소 간 이동 동선을 고려한 날짜별 일정표를 자동 생성**하는 웹 서비스다.

생성된 일정표는 다음을 포함한다:

- 날짜별 타임라인 (시간 · 장소 · 활동 · 설명 · 추천 이유)
- 장소 간 이동 동선을 표시한 지도
- 각 일정지에 대한 **참고자료 1~3개** (한국관광공사 / 축적된 Knowledge / 네이버 블로그 / YouTube 중에서 품질순으로 동적 선택)
- 사용자가 직접 수정할 수 있는 편집 기능
- 여행 후 후기 작성 → 축적 데이터로 재사용

TripTube AI는 매 요청마다 인터넷을 처음부터 검색하는 서비스가 **아니다**. 기존 DB·Knowledge를 우선 활용하고, 부족한 정보만 외부에서 보충한다(§8, §9).

## 2. Problem

여행 계획 초기 단계의 여행자는 YouTube·블로그를 수십 개 오가며 정보를 모으지만:

- 본 내용을 금세 잊고, 정보가 한곳에 정리되지 않는다.
- 같은 정보의 복제 콘텐츠·광고성 콘텐츠가 섞여 판단이 어렵다.
- 결국 조사한 정보가 **하나의 실행 가능한 일정**으로 이어지지 않는다.
- "장소 목록"은 얻어도 "며칠에 어디를 어떤 순서로" 라는 동선 설계는 여전히 수작업이다.

기존 도구(장소 검색형 서비스, 지도 즐겨찾기, 여행 유튜브 큐레이션)는 이 마지막 단계 — **요구 해석 → 장소 선정 → 동선 설계 → 일정화** — 를 사용자에게 떠넘긴다.

## 3. Product Vision

> **사용자의 한 문장을, 근거가 붙은 실제 여행 일정으로 바꾼다.**

- 사용자는 장소를 일일이 고르지 않는다. 요구를 말하면 AI가 고른다.
- AI의 선택에는 항상 "왜 이 장소인가"와 "이 장소가 실제로 어떤 곳인가"를 확인할 참고자료가 붙는다.
- 같은 지역 요청이 반복될수록 축적된 Knowledge/DB 활용도가 올라가고, 불필요한 외부 API 호출은 줄어든다.
- 여행 후기가 다음 사용자의 일정 품질로 되돌아온다.

## 4. Core User Experience

```
"3박4일 도쿄 여행을 할건데, 가족끼리 힐링하고 맛집 위주로 가고 싶어."
          │
          ▼
① 요구 해석          목적지 / 기간 / 동반자 / 목적 / 취향 / 자유조건 파악
          ▼
② 장소·지식 확보      기존 DB·Knowledge 우선 → 부족분만 외부 Search
          ▼
③ 장소 후보 선정      요구에 맞는 장소를 AI가 후보로 추림
          ▼
④ 이동 동선 분석      가까운 장소끼리 묶고, 하루 이동 효율을 고려
          ▼
⑤ AI 일정 생성        날짜별 시간·장소·활동·추천 이유
          ▼
⑥ 일정표 + 지도       타임라인 + 이동 동선 지도
          ▼
⑦ 참고자료 표시       일정지마다 1~3개 (관광공사/Knowledge/블로그/YouTube)
          ▼
⑧ 사용자 수정         장소 추가·삭제·교체, 순서·비중 변경
          ▼
⑨ 일정 확정
          ▼
⑩ 여행 후기 작성
          ▼
⑪ 데이터 축적         확정 일정·후기가 다음 요청에 재사용
```

이 11단계가 TripTube AI의 핵심 사용자 경험이다. 내부적으로 Pipeline A/B(§9, §11)로 나뉘어 있어도, 사용자에게는 **하나의 TripTube AI**로 보여야 한다.

## 5. Target User

- 여행 계획 초기 단계에서 YouTube·블로그를 순회하는 20~40대 여행자
- 짧은 시간에 신뢰할 수 있는 여행 초안을 원하는 사용자
- 자연어로 여행 조건을 설명하고 싶은 사용자
- 여러 콘텐츠를 직접 비교·정리하기 번거로운 사용자
- 국내(제주·서울 등) 및 주요 해외 도시(도쿄·오사카 등) 여행자

## 6. Core User Flow

| 단계 | 사용자 행동 | 시스템 동작 | 현재 구현 |
|---|---|---|---|
| 진입 | 랜딩(`/`)에서 "무료로 일정 만들기" | 비로그인 → 예시(`/plan/example`)·로그인 유도 / 로그인 → `/plan/new` | ✅ |
| 요청 입력 | 폼 또는 챗봇으로 조건 입력 | `TripRequest` 확정 (목적지·지역·구성원·인원·박수·월·목적+우선순위·자유 notes) | ✅ 폼 + 챗봇(`trip-chat`) |
| 요구 해석 | — | 나라 단위 입력이면 도시로 되묻기, 국내/해외 판정, 목적→우선순위 | ✅ 챗봇/폼 |
| 장소·지식 확보 | — | 지원 지역이면 TourAPI/Knowledge 조회 → AI 프롬프트 참고자료로 공급, 부족분은 장소 단위 외부 검색 | ✅ (§9, §11) |
| 일정 생성 | "AI 일정 만들기" | `generateItinerary()` — AI가 `dayRegions` + 날짜별 항목 생성 → 항목별 소스 매칭 → 지오코딩 → 동선 정렬 | ✅ `src/lib/itinerary.ts` |
| 결과 확인 | `/plan/result/[id]` | 요약 · 타임라인 · 지도 동선 · 항목별 참고자료 · 여행 팁 | ✅ |
| 수정 | 항목 삭제 / 장소 추가 / 조건 다시 입력 / 자연어 재요청 | 항목 제거, 장소 추가(날짜 지정), 재생성(교체 저장), 해당 날짜 자연어 재생성 | ✅ (드래그 재정렬만 Post-MVP, §16) |
| 확정 | (저장은 생성 시 자동) | `itineraries`에 저장, 공유 링크 | 🟡 명시적 "확정" 상태 없음 (§17) |
| 후기 | `/reviews`에서 후기 작성 | `reviews` 테이블 저장, `itineraryId`로 일정 연결 | ✅ (랭킹 신호 반영은 Post-MVP, §18) |
| 재사용 | 다음 요청 | 확정 Knowledge가 프롬프트로 재유입 | 🟡 후기 재사용 경로 없음 (§19) |

## 7. Travel Request Interpretation

입력 채널은 두 가지이며 동일한 `TripRequest`로 수렴한다:

- **폼** (`src/components/plan/trip-form.tsx`)
- **챗봇** (`src/lib/trip-chat.ts`, `google/gemini-3.6-flash`) — 대화하며 `updateTripDraft` 툴로 폼을 실시간 채운다.

해석 대상:

| 필드 | 값 | 비고 |
|---|---|---|
| `destination` | 자유 입력 | "베트남" 같은 나라 단위는 도시로 되묻기(`AMBIGUOUS_DESTINATIONS`) |
| `region` | 국내 / 해외 | 챗봇이 사실 지식으로 자동 판정 |
| `memberType` | 혼자 / 친구 / 가족 / 연인 / 동료 | |
| `memberCount` | 정수 | |
| `nights` | 박 수 | 일수 = nights + 1 |
| `month` | 1~12 | 기후·준비물 팁 생성에 사용 |
| `purposes` | 목적 10종 + 우선순위(core/important/normal) | core 최대 3개 |
| `notes` | 자유 텍스트 | "2일차는 성산 근처", "우도 꼭", "한라산 빼줘" 등 — **다른 어떤 조건보다 우선** 반영 |

**여행 목적 10종:** 🍜 맛집·미식(food) / 🏖️ 휴양·힐링(healing) / 🏞️ 자연·풍경(nature) / 📸 관광·명소(attraction) / ☕ 카페·감성(cafe) / 🎢 액티비티·체험(activity) / 🏛️ 문화·역사(culture) / 🛍️ 쇼핑(shopping) / 🎉 축제·공연(festival) / 🌙 야경·나이트라이프(nightlife)

우선순위 가중치: core = 1.0, important = 0.7, normal = 0.4.

## 8. Search Strategy

### 8.1 대원칙

```
사용자 요청
   ↓
기존 DB / Knowledge 우선 활용
   ↓
부족한 정보만, 우선순위 순서대로 외부 Search
   ↓
장소 후보 확보
   ↓
AI 일정 생성
```

앞 단계에서 충분한 자료가 확보되면 **뒤 단계 Search는 생략**한다. "모든 소스를 항상 호출"하는 구조가 아니다.

### 8.2 국내 여행 Search 우선순위

1. **한국관광공사(TourAPI)** — 공식 관광정보. `places` 테이블(externalSource="tour_api"). 현재 서울·제주시·서귀포시 약 120건.
2. **기존 Knowledge** — 검수 완료된 `video_knowledge` (지역 코드 기준).
3. **네이버 블로그** — 최근 1년 이내 실방문 후기.
4. **YouTube** — §10 정책에 따라 최소화.

### 8.3 해외 여행 Search 우선순위

1. **기존 Knowledge** — 도쿄·오사카는 Knowledge-derived 장소 보유(약 28/27건).
2. **네이버 블로그**
3. **YouTube** — §10 정책에 따라 최소화.

(해외는 TourAPI 대상이 아니며, 지오코딩은 Google Geocoding을 쓴다.)

### 8.4 Search fallback 규칙

- 필요한 정보가 이미 DB/Knowledge/캐시에 있으면 → 외부 검색 생략.
- 부족하면 → 다음 우선순위 소스 1개만 추가 호출.
- 외부 호출은 항상 공용 캐시(`source_cache`, YouTube 30일 TTL) · 락(`search_locks`) · Rate Limiter(`api_rate_limits`)를 통과한 뒤에만 실제 API를 친다.
- API 실패·쿼터 초과가 일정 생성 전체 실패로 이어지지 않는다 → 결정론적 fallback 일정으로 대체(`generateItineraryFallback`).

### 8.5 검색 우선순위 사다리 (구현됨)

`src/lib/itinerary.ts` `attachSourcesAndLocations()`는 확정된 일정 항목을 먼저 검증 장소(TourAPI·검수된 Knowledge)와 이름 매칭한다(`matchedPlaceByTitle`). 매칭된 항목은 그 장소 전용 YouTube `search.list` 호출을 **건너뛰고**(공식 관광정보·검수 지식이 영상보다 신뢰할 수 있는 1차 근거), 장소명으로 네이버 블로그만 1건 검색해 붙인다. 매칭되지 않는 항목만 `{목적지} {장소명}` 쿼리로 YouTube+네이버 전용 검색 대상으로 남는다 — 지원 지역 일정일수록 신규 `search.list` 호출이 크게 준다. 외부 호출은 여전히 `source_cache`(정규화된 키, 30일 TTL) · `search_locks` 단일 실행 · `api_rate_limits` 일일 상한을 통과한다.

## 9. Knowledge / ATKB Role

Knowledge는 단순 검색 결과가 아니라 **"TripTube AI가 여행 계획을 만들 때 재사용하는 축적된 여행 지식"** 이다.

### 9.1 데이터

- `video_knowledge` — YouTube 영상 제목/설명에서 AI가 추출한 여행 지식(약 582행 / 73개 영상). `src/lib/knowledge/extract.ts`.
- 유형(`knowledgeType`): place / food / accommodation / shopping / experience / transport / course / info.
- 각 행: `content`(summary·priceInfo·hours·tips·warnings) + `extractionMethod` + `confidence` + `sourceReference` + `status`.

### 9.2 검수 파이프라인 (사람이 판정, AI 아님)

- `status`: unverified → (사람 검수) → confirmed / review / rejected.
- Google Sheets(`KNOWLEDGE_REVIEW`) 내보내기/가져오기로 Q1~Q9 루브릭 검수. DB CHECK 제약으로 confirmed 조건 강제(Q1/Q2/Q3/Q5/Q6 통과).
- `publishable`(Q9) — 독립 콘텐츠 카드 공개 가부. confirmed와 별개 축.
- 현재 confirmed는 소수(서울 파일럿 수준). **대량 자동 검수는 Out of Scope(§26).**

### 9.3 서비스 유입 경로 (실제 코드 기준)

| 함수 | 쓰임 | 조건 |
|---|---|---|
| `getConfirmedRegionalKnowledge(regionCode)` | 일정 생성 AI 프롬프트의 `regionalKnowledge` 참고자료 | status=confirmed, videoId 경로, 지역당 최대 10 |
| `getKnowledgeDerivedPlacesByRegion(regionCode)` | 추천/일정의 장소 후보(`verifiedPlaces`)에 병합 | confirmed + publishable=yes + place_id 연결 |
| ~~`getConfirmedRegionalKnowledgeByType`~~ | `/places` 검수 카드 전용 → 함수 삭제 (§27.1) | — |
| ~~`getConfirmedRegionalCourses`~~ | `/places` 검수 코스 카드 전용 → 함수 삭제 (§27.1) | — |

### 9.4 v3.0에서의 위치

Knowledge는 **A의 판단을 강화하는 지식 공급원**이다(PHASE 14 A-BRIDGE 결정). B가 A를 대체하지 않는다. 지원 지역이 아니면 조회는 빈 배열 → 기존 동작과 100% 동일(순수 추가 기능).

## 10. YouTube Strategy / API Minimization

YouTube는 **1차 장소 검색원이 아니다.** 확정된 일정지에 대한 참고·신뢰 자료를 보강하는 미디어 소스다.

```
요구 해석 → 관광공사/Knowledge/블로그로 장소 후보 확보 → AI가 장소·동선 결정
        → 최종 일정지 확정 → 그 일정지에 필요한 경우에만 YouTube 자료 검색 → 일정표에 영상 제공
```

원칙:

- 기존 `source_cache`(및 향후 `videos` 테이블)에 해당 장소 자료가 있으면 **우선 재사용**.
- 같은 장소를 반복 검색하지 않는다(캐시 공유 — 인기 장소일수록 신규 호출 감소).
- 일정에 실제 포함된 장소 중심으로만 검색. 모든 장소에 무조건 검색하지 않는다.
- 가능하면 한 장소당 적절한 영상 **0~1개** 선택(현재는 항목당 최대 3 소스, v3.0에서 품질 우선 1~3으로 조정 — §13).
- 여행 1건당 신규 `search.list` 호출 상한 유지(`MAX_PLACE_SEARCH_QUERIES = 30`), 캐시/락/일일 쿼터로 보호.
- 일일 쿼터 초과 시 그 쿼리는 YouTube를 건너뛰고 네이버/Knowledge/목업으로 채운다.
- `search.list` / `videos.list` 등 API별 실제 quota 차이는 구현 시점에 **공식 문서 기준**으로 결정한다. PRD는 특정 API가 무조건 더 싸다고 단정하지 않는다.

## 11. Place Selection

### 11.1 지원 지역(실제 데이터 보유)

| region.code | 라벨 | 데이터 |
|---|---|---|
| KR-SEOUL-CITY | 서울 | TourAPI 장소 + Knowledge |
| KR-JEJU-JEJUSI | 제주시 | TourAPI 장소 + Knowledge |
| KR-JEJU-SEOGWIPO | 서귀포시 | TourAPI 장소 + Knowledge |
| JP-TOKYO | 도쿄 | Knowledge-derived 장소만(약 28) |
| JP-OSAKA | 오사카 | Knowledge-derived 장소만(약 27) |

목적지명 ↔ region.code 매핑은 현재 4곳(`itinerary.ts`, `actions.ts`, `/places` 3개 페이지)에 중복 정의 — 지역이 소수라 공유 모듈로 뽑지 않았다. 지역 확장 시 이 매핑을 함께 갱신해야 한다.

### 11.2 후보 선정 로직

- **지원 지역:** `getPlacesByRegion()`(TourAPI) + `getKnowledgeDerivedPlacesByRegion()`(Knowledge)를 provenance 유지한 채 병합 → `verifiedPlaces`.
  - `/places/recommend`: `recommendPlaces()`가 `google/gemini-3.6-flash`로 후보 중에서 골라 이유를 설명(후보 밖 장소 생성 금지, 방어적 검증).
  - `/plan/new`: `verifiedPlaces` + `regionalKnowledge`를 일정 생성 프롬프트에 주입. 사용자가 `/places`에서 고른 장소는 `mustIncludePlaceIds`로 강제 포함.
- **비지원 지역(대다수):** `verifiedPlaces` 빈 배열 → AI가 목적지 대표 활동 카탈로그(`mock/destinations.ts`) + 일반 여행 지식으로 장소를 정하고, 항목별 장소 검색으로 소스를 붙인다.

### 11.3 안티-날조 규칙 (구현됨)

- `verifiedPlaces`에 없는 유형은 일반 지식으로 채우되, "TourAPI/공식 자료로 검증된 것처럼" 표현 금지.
- 후보 목록 밖 `placeId`를 답하거나 중복 추천하면 결과에서 제외.

## 12. Route / Itinerary Generation

`src/lib/itinerary.ts` `generateItinerary(request, { mustIncludePlaceIds? })`:

1. `resolveDestination()` — `findDestination()` 또는 `genericDestination()`.
2. 지원 지역이면 `verifiedPlaces` / `regionalKnowledge` 조회.
3. **`generateItineraryWithAI()`** (`smartModel` — Gemini 직결, §20·§27.2, Zod 스키마 강제):
   - 먼저 `dayRegions[]` — 1일차부터 각 날의 소지역을 지리적으로 한 방향으로 이어지게 결정.
   - `days[].items[]` — 시간(HH:MM) · title(지도에 찍히는 구체적 장소 하나) · description · tags(목적) · geocodeQuery(해외는 현지어/영문).
   - 1일차 첫 항목 = 도착, 마지막 날 마지막 항목 = 출발. 해외·제주는 공항, notes에 배편 언급 시 여객터미널, 그 외 국내는 일반 도착/출발. notes에 교통수단이 명시되면 항상 그쪽 우선.
   - 하루 3~5개(마지막 날 3개 이하), 마지막 날 제외 각 날 마지막은 숙소.
   - 2회 재시도 후에도 실패하면 `generateItineraryFallback()` — area 단위 결정론적 배정.
4. **`attachSourcesAndLocations()`**:
   - 항목별 장소 전용 검색(`{목적지} {장소}` 캐시 우선 → 락 → Rate Limiter → YouTube + 네이버, 최대 30 고유 장소).
   - 못 채운 항목만 목적지 단위 `SearchPlan` 보충 풀로 넓히기 → 그래도 부족하면 목업 플레이스홀더.
   - 자체 랭킹(§13) 후 항목당 소스 배정, 채널 중복 회피.
   - 지오코딩: `verifiedPlace` 매칭 + 좌표 신뢰 시 그 좌표 사용(재지오코딩 생략), 아니면 `resolveGeocodeProvider(region)` (국내 네이버 / 해외 구글).
   - `reorderDayItemsByGeography()` — 하루 안 항목을 지리적 한 방향 순서로 재정렬 + 시간 재계산.
5. `ensureMustIncludePlaces()` — 사용자 지정 장소가 누락됐으면 강제 삽입 + 해당 날짜만 재정렬.
6. `saveItinerary()` → `itineraries` 테이블(days JSONB).

## 13. Evidence / Reference Materials

각 일정지에는 **"왜 AI가 이 장소를 추천했는지"와 "이 장소가 실제로 어떤 곳인지"** 를 확인할 수 있는 참고자료를 붙인다. 검색 결과를 많이 보여주는 것이 목적이 아니다.

- **기본 1개, 필요하면 최대 3개.** 모든 장소가 3개를 채울 필요는 없다 — 품질·적합성 우선으로 1~3개를 동적으로 제공한다.
- 자료 유형: 한국관광공사 / 축적된 Knowledge / 네이버 블로그 / YouTube.
- 추천 이유(description)에는 근거로 삼은 구체적 내용(수치·이용시간·요약)을 실제로 언급한다("좋다"만 쓰지 않는다).

**현재 구현:** `ItineraryItemCard`, `MAX_REFERENCES = 3`. 항목이 검증 장소(TourAPI·검수 Knowledge)에 매칭되면 그 상세(주소·개요·근거·공식 홈페이지)를 참고자료 블록 맨 앞에 고정하고("한국관광공사"/"여행 지식" 배지), 남은 슬롯을 `scoreSourceForItem` 순으로 정렬된 블로그·영상으로 채운다(합계 최대 3, `source-card.tsx`). 4개 유형(한국관광공사 / 여행 지식 / 네이버 블로그 / YouTube)이 모두 카드에 노출된다. 자료가 하나도 없으면 결과 화면이 "AI가 선택한 장소 정보를 바탕으로 구성"이라고 정직하게 표시한다.

## 14. Itinerary UI

`/plan/result/[id]` (`ItineraryView`):

- 요약 카드: 여행지 · 구성원 · 일정 · 참고용 평균 여행경비 · 목적 배지.
- 여행 팁 카드(`TripTipsCard`): 기후 · 준비물 · (해외) 최근 이슈. `trip_tips_cache` 재사용.
- 일정 동선 지도(§15).
- 일자별 순서도(`DayFlowCard`).
- 날짜별 카드 → 항목 카드(시간 · 제목 · 설명 · 태그 · 참고자료 · 지도 인덱스).
- PDF 내보내기(`ItineraryPdfButton`, 클라이언트 html2canvas + jsPDF) — **PC 전용**(§27.3). 모바일은 미리보기 + 안내.
- 공유 링크(결과 페이지는 소유자 무관 공개 조회).

## 15. Map / Movement Visualization

- 일정 순서대로 장소 마커 + 이동 동선 표시(`ItineraryMap`, `PlacesMap`).
- Provider 추상화(`src/components/itinerary/map-providers/`): 국내 Naver Maps / 해외 Google Maps, `region` 기준 `resolver.ts`가 선택.
- 좌표 신뢰도 판정(`isCoordinateReliable`) — 행정구역 수준의 부정확한 좌표는 지도에서 제외, 마커를 잘못 찍지 않는다.
- 일차별 색상 구분, 하루 단위 동선 정렬.

## 16. Itinerary Editing

사용자가 생성된 일정을 자기 것으로 만들 수 있어야 한다.

| 편집 | 현재 구현 | v3.0 MVP 목표 |
|---|---|---|
| 항목 삭제(AI 생성 항목) | ✅ `removeItineraryItemAction` | 유지 |
| 장소 항목 삭제(placeId 항목) | ✅ `removePlaceFromItineraryAction` | 유지 |
| 장소 추가 | ✅ `addPlaceToItineraryAction`(날짜 지정) | 유지 |
| 조건 다시 입력 → 재생성 | ✅ `/plan/new?editFrom=` → 교체 저장(`updateItinerary`) | 유지 |
| 장소 교체 / 휴식·맛집·관광 비중 변경 | ✅ **자연어 재요청 1턴** — `reviseItineraryDayAction` → `reviseItineraryDay()`가 지정한 날짜만 재생성하고 그 날짜의 소스·좌표를 다시 붙인다. 소유자 전용 폼(`revise-day-form.tsx`). | 유지 |
| 드래그 순서 변경 | ❌ Post-MVP | — |

편집의 소유권은 항상 `(itineraryId, userId)` 이중 검증.

## 17. Itinerary Confirmation

- 현재: 일정은 생성 시 `itineraries`에 자동 저장되며, 별도의 "확정" 상태가 없다.
- v3.0 MVP: 명시적 확정 없이 **"저장됨 = 확정"** 으로 둔다(스키마 변경 없음). 결과 페이지의 "새 일정 만들기 / 조건 다시 입력 / 삭제"로 충분하다.
- Post-MVP: `itineraries`에 `status`(draft/confirmed) 추가, 확정 시에만 후기 유도 강화.

## 18. Review / Feedback

- `/reviews` — `createReviewAction` → `reviews` 테이블(author · destination · rating · title · content · tripMonth · nights · `itineraryId`).
- 결과 페이지에서 "후기 남기기" CTA(`WriteReviewDialog`, 여행지·박수 프리필) — 로그인 필수(§27.6), 작성 시 그 `itineraryId`를 함께 저장.
- 후기 카드에서 연결된 일정으로 가는 링크("이 후기의 일정 보기 →", `review-card.tsx`). 본인 후기는 수정 가능(§27.6).
- 아직 없는 것: 후기 평점·본문을 장소/코스 랭킹 신호로 반영하는 경로 — §19/Post-MVP.

## 19. Data Accumulation / Reuse

목표: 같은/유사 지역 요청이 반복될수록 축적 데이터 활용도가 오르는 구조.

**현재 작동하는 재사용 경로:**

- `source_cache` — 장소 단위 검색 결과를 사용자·여행 간 공유(YouTube 30일 TTL). 인기 목적지 pre-fetch 크론(`/api/cron/prefetch`).
- `getConfirmedRegionalKnowledge` — 검수 완료 Knowledge가 지역 코드 기준으로 일정 생성 프롬프트에 재유입.
- `getKnowledgeDerivedPlacesByRegion` — 검수 완료 장소가 추천/일정 후보로 재유입.
- `trip_tips_cache` — 목적지+월 기후 팁 캐시.

**아직 없는 경로(Post-MVP):**

- 확정 일정 자체를 다음 사용자에게 참고 코스로 제시.
- 후기(평점·본문)를 장소/코스 랭킹 신호로 반영.
- 후기에서 새 Knowledge 추출.

## 20. AI Provider Strategy

- AI 호출은 **provider abstraction**을 유지한다. 특정 유료 중계 계층에 종속되지 않는다.
- 구현: AI SDK v7(`ai` 패키지). 제공자 선택은 `src/lib/ai/model.ts` 한 곳에서만 하고, 호출부(`itinerary.ts`/`place-recommendation.ts`/`trip-tips.ts`/trip-chat route)는 `smartModel`(일정 생성·수정)·`fastModel`(챗봇·장소 추천·여행 팁)만 import한다.
- 현재 제공자: **Google Gemini API 직결**(`@ai-sdk/google`, `GOOGLE_GENERATIVE_AI_API_KEY`). `"provider/model"` 문자열이 아니라 모델 인스턴스를 넘겨 별도 중계 계층 없이 제공자 API로 직접 호출한다. 두 티어 모두 `gemini-3.6-flash`(무료 티어).
- 제출용 MVP에서는 무료 사용 가능한 AI API 사용을 우선한다. 단 "완전 무제한 무료"라고 표현하지 않으며, 실제 quota/조건은 구현 시점 공식 문서 기준으로 확인한다.
- 로컬 LLM은 필수 구성이 아니다.
- 이 PRD는 특정 모델명을 제품 요구사항으로 고정하지 않는다. 제공자 교체 = `src/lib/ai/model.ts` 수정.

## 21. MVP Scope (MUST HAVE)

제출 시점에 데모 가능해야 하는 것:

1. 자연어 여행 요청 입력 (폼 + 챗봇) — ✅ 있음
2. 여행 조건·지역·기간·취향 해석 — ✅ 있음
3. 지역별 Search Strategy (국내: 관광공사→Knowledge→블로그→YouTube / 해외: Knowledge→블로그→YouTube), 앞 단계 충분 시 뒤 단계 생략 — ✅ 우선순위 사다리 구현 (§8.5)
4. 기존 Knowledge 우선 활용 — ✅ 프롬프트 주입 경로 있음
5. 필요한 경우에만 외부 자료 검색 (캐시·락·Rate Limiter) — ✅ 있음
6. AI 여행 일정 생성 (날짜별 시간·장소·활동·추천 이유·도착/출발 고정·동선 정렬) — ✅ 있음
7. 일정지별 참고자료 1~3개 (4개 유형에서 품질순) — ✅ 관광공사·여행 지식·블로그·영상 모두 카드에 노출 (§13)
8. 장소 간 이동 동선 — ✅ 있음
9. 지도 표시 (국내 Naver / 해외 Google, Provider 추상화) — ✅ 있음
10. 일정 수정 (항목 삭제·장소 추가·조건 재입력, + 자연어 재요청 1턴) — ✅ 있음 (`reviseItineraryDayAction`, §16). 드래그 재정렬만 Post-MVP.
11. 일정 확정/저장 (저장=확정) — ✅ 있음
12. 후기 작성 기본 흐름 — ✅ 있음 (`itineraryId`로 일정 연결, §18)

## 22. Post-MVP Scope

- 후기 ↔ 일정 연결, 후기를 랭킹 신호로 반영
- 확정 일정을 다음 사용자에게 참고 코스로 제시
- 드래그 순서 변경, 세밀한 비중 슬라이더 UI
- 명시적 `itineraries.status`(draft/confirmed)
- 지원 지역 확장 (region.code 매핑 4곳 갱신 + TourAPI/Knowledge 수집)
- 일정지 참고자료에 조회수·참여도 등 실제 지표 반영
- pre-fetch 스케줄러 고도화, Search Job Queue 분리

## 23. Demo Scenario

**입력:** `/plan/new` 챗봇에 —
> "3박4일 도쿄 여행을 할건데, 가족끼리 힐링하고 맛집 위주로 가고 싶어."

**시연 흐름:**

1. 챗봇이 목적지=도쿄(해외), 기간=3박4일, 구성원=가족, 목적=힐링(core)+맛집(core)을 파악해 폼을 채운다.
2. "AI 일정 만들기" → 로딩 화면(여행 팁 노출).
3. 도쿄 Knowledge-derived 장소 + confirmed Knowledge를 참고자료로 일정 생성.
4. `/plan/result/[id]` — DAY 1~DAY 4 타임라인:
   - 1일차 첫 항목 = 도쿄 공항 도착, 4일차 마지막 = 공항 출발.
   - 각 일정지: 시간 · 장소 · 활동 · **추천 이유**(가족+힐링+맛집 조건과 동선 근거) · **참고자료 1~3개**.
5. 지도에 일자별 이동 동선 표시.
6. 사용자가 한 항목을 삭제하거나 `/places`에서 장소 하나 추가.
7. (저장=확정) 결과 페이지 유지.
8. "후기 남기기"로 후기 작성 → `/reviews`에 노출.

이 시나리오가 "TripTube AI가 무엇을 하는 서비스인가"를 가장 짧게 보여준다.

## 24. Current Implementation Mapping

| 영역 | 파일 | 상태 |
|---|---|---|
| 랜딩 | `src/app/page.tsx` | ✅ CTA → `/plan/new` |
| 요청 폼 | `src/components/plan/trip-form.tsx`, `trip-planner.tsx` | ✅ |
| AI 제공자 | `src/lib/ai/model.ts` | ✅ Gemini API 직결 (`@ai-sdk/google`, `smartModel`/`fastModel`) |
| 챗봇 | `src/lib/trip-chat.ts`, `src/app/api/trip-chat/route.ts` | ✅ `fastModel` |
| 일정 생성 (Pipeline A) | `src/lib/itinerary.ts` | ✅ `smartModel` + 자체랭킹 + fallback |
| 장소 후보 병합 | `src/lib/itinerary.ts`, `src/db/knowledge-queries.ts` | ✅ TourAPI + Knowledge를 `verifiedPlaces`로 병합 (Pipeline B 전용 `place-recommendation.ts`는 폐지, §27.1) |
| ~~장소 브라우징 `/places`~~ | — | ❌ 폐지 (§27.1). 근처 장소는 `/api/nearby-places` AI 생성 |
| A↔B 브릿지 | `itinerary.ts` `verifiedPlaces`/`regionalKnowledge`/`mustIncludePlaceIds` | ✅ PHASE 14 |
| 결과 화면 | `src/app/plan/result/[id]/page.tsx`, `ItineraryView` | ✅ |
| 지도 Provider | `src/components/itinerary/map-providers/` | ✅ Naver/Google |
| 지오코딩 | `src/lib/geo/geocode-provider.ts`, `src/lib/real/geocode.ts` | ✅ |
| 외부 검색 | `src/lib/real/youtube.ts`, `naver-blog.ts` | ✅ + 캐시/락/RateLimit |
| Knowledge 추출 | `src/lib/knowledge/extract.ts` (미커밋) | ✅ 스크립트 실행 완료 |
| Knowledge 검수 | `src/lib/sheets/*`, `KNOWLEDGE_REVIEW` 시트 | ✅ Q1~Q9 |
| 편집 | `src/lib/actions.ts` (add/remove/replace + `reviseItineraryDayAction`) | ✅ 자연어 날짜 재생성 포함 (§16) |
| 후기 | `src/app/reviews/`, `createReviewAction` | ✅ `reviews.itinerary_id`로 일정 연결 (§18) |
| 대시보드 | `src/app/dashboard/page.tsx` | ✅ 공개 목 통계 (`/admin`이 실데이터 담당) |
| DB 스키마 | `src/db/schema.ts` (17 테이블: 코어 7 + ATKB 10) | ✅ |
| 분석 로그 | `pipeline_b_events` | 🟡 `/places` 흐름 지표 — 폐지 후속 정리 대상 (§27.1) |

**스택:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · shadcn/Base UI · Clerk · Neon Postgres + Drizzle · Vercel · AI SDK v7.

## 25. Implementation Priorities

v3.0 데모 가치 기준 우선순위 4개 — **모두 구현 완료**(`dcbf94e` "realign to PRD v3.0"):

1. **일정지 참고자료 4개 유형** (§13) — ✅ 검증 장소 상세 + 블로그·영상을 한 카드에, 최대 3개.
2. **Search 우선순위 사다리** (§8.5) — ✅ 검증 장소 매칭 항목은 YouTube `search.list` 생략.
3. **자연어 일정 수정 1턴** (§16) — ✅ `reviseItineraryDayAction`로 지정 날짜만 재생성.
4. **후기 ↔ 일정 연결** (§18) — ✅ `reviews.itineraryId`(additive) + 결과 페이지 후기 CTA + 후기 카드의 일정 링크.

다음 후보(Post-MVP, §22): 후기를 랭킹 신호로 반영, 확정 일정을 참고 코스로 재노출, 드래그 재정렬.

## 26. Out of Scope

- 항공권/숙박 예약·결제
- 대규모 자동 Knowledge 수집 / 복잡한 Knowledge scoring / 완전 자동 검수 시스템
- 대규모 지역 확장, 고급 개인화 추천, 자동 학습 시스템
- 과도한 데이터 정규화, 필요 이상의 API 최적화, 복잡한 관리자 기능
- 1차 다국어 지원, 네이티브 앱
- YouTube 웹 크롤링·비공식 API 우회, 영상 전체 다운로드·재배포
- 특정 AI 중계 계층을 필수 구성요소로 고정하는 것
- 제출 데모에 직접 영향을 주지 않는 모든 고도화

---

## 27. v3.0 이후 반영 사항 (2026-08-30)

v3.0(2026-08-27) 문서화 이후 실제 배포·정리된 내용. 본문 조항 중 이 절과 상충하는 서술은 이 절이 우선한다.

### 27.1 `/places` · Pipeline B 폐지

- **A-BRIDGE 결정(부록 A) 확정.** "장소 둘러보기"(`/places`, `/places/recommend`, `/places/plan`, `/places/[id]`)와 Pipeline B 전용 코드(`lib/place-recommendation.ts`, `lib/places-trip-context.ts`, `components/places/*`)를 **삭제**했다. 사용자 여정은 `/plan/new`(Pipeline A) 하나로 단일화.
- "이 지역 더 둘러보기"는 장소 카탈로그가 아니라 **AI 생성**(`/api/nearby-places`, `generateNearbyPlaces` + `nearby_places_cache`)으로 대체.
- Pipeline B 잔여도 제거: `db/pipeline-b-events.ts` 삭제, `actions.ts`의 `generateItineraryFromPlacesAction`·`addPlaceToItineraryAction`·`logPipelineBEvent` 호출 제거, `/admin`의 "Pipeline B 실사용 현황" 패널 제거. **DB `pipeline_b_events` 테이블과 `schema.ts`의 정의는 유지**(파괴적 마이그레이션 금지 정책 — 다시 쓸 때 재연결).
- `src/db/place-insert.ts`(repo 내 호출자 0건, ATKB 추출 스크립트가 미커밋이라 사용처 없음)도 삭제. 재필요 시 `lib/knowledge/` 스크립트와 함께 복원.
- 본문 §9.3 / §11 / §15 / §16 / §24의 `/places` 언급은 히스토리로 둔다.

### 27.2 AI 모델 — Gemini 직접 호출

- Vercel AI Gateway를 걷어내고 **Google Gemini API 직결**(`@ai-sdk/google`, `GOOGLE_GENERATIVE_AI_API_KEY`, `gemini-3.6-flash`). §20과 동일 — 본문 §12의 `anthropic/claude-sonnet-5` 표기는 `smartModel`(Gemini)로 정정.

### 27.3 PDF 다운로드 PC 전용

- 모바일 인앱 브라우저(카카오/네이버)는 클라이언트 측 우회 5종을 모두 시도해도 다운로드를 완료하지 못해, **PDF는 PC 전용**으로 제한. 모바일은 미리보기 + 안내만 제공(`ItineraryPdfButton`).

### 27.4 브랜드 비주얼 아이덴티티 (UI/UX 리프레시)

- 컨셉 "여행 × 유튜브의 만남". 3색 브랜드 팔레트를 `globals.css` 토큰으로 정의: `--brand`(바다빛 블루, `--primary`의 별칭) · `--brand-2`(유튜브 코럴) · `--brand-3`(노을 앰버).
- 선명한 타이포(진한 `--foreground`/`--muted-foreground`), 생동감 있는 카드(그림자 + hover 리프트/스케일 + `active:` 탭 피드백), 그라데이션 CTA(`variant="brand"`), 스크롤 등장 애니메이션(`components/reveal.tsx`, `prefers-reduced-motion` 대응).
- **라이트 전용 확정.** 작동한 적 없던 `.dark` 블록·`dark:` 유틸 제거, `color-scheme: light` 명시. 다크 모드는 필요 시 토글 + 전용 QA로 별도 기능화.
- 대비: `.bg-brand-gradient` 위 흰 글자가 WCAG AA(4.5:1)를 넘도록 그라데이션 양 끝을 조정.

### 27.5 Google Sheets 검수 연동 — 서비스 계정 인증으로 전환

- 기존 OAuth 리프레시 토큰 방식은 동의 화면이 "테스트" 상태면 토큰이 **7일마다 만료**돼 `/admin` 시트 내보내기가 주기적으로 실패했다.
- `src/lib/sheets/client.ts` `getAccessToken()`을 **인증 방식 자동 선택**으로 변경: `GOOGLE_SA_CLIENT_EMAIL` + `GOOGLE_SA_PRIVATE_KEY`가 있으면 서비스 계정 JWT(`node:crypto` RS256, 라이브러리 없음)로, 없으면 기존 OAuth로 폴백.
- 서비스 계정 방식은 토큰 만료·동의 화면·앱 게시가 전부 불필요. 스프레드시트를 서비스 계정 이메일에 "편집자"로 공유하면 끝. (조직 정책 `iam.disableServiceAccountKeyCreation`은 프로젝트 레벨 재정의로 해제)
- §9.2의 KNOWLEDGE_REVIEW / CONTENT_MASTER 내보내기·가져오기 로직 자체는 무변경 — 토큰 획득 계층만 교체.

### 27.6 후기 편집·로그인 게이트 / AI 장애 하드닝 / 챗봇 지연 (2026-08-31, PR #56~#59)

**후기 (PR #56)**
- 본인이 쓴 후기 **수정** 추가: `WriteReviewDialog`에 `editReview` 모드, `updateReview`/`updateReviewAction`가 `(id, userId)` 소유권 검증(`updateItinerary`와 동일 패턴). `Review.userId` 추가, `getReviews(currentUserId?)`는 조회자 본인 행에만 `userId`를 실어 보낸다(다른 작성자 Clerk id 비노출).
- **후기 작성은 로그인 필수로 전환** — `createReviewAction`에 `if (!userId) return`, 로그아웃 시 `/reviews`·결과 페이지 CTA는 `<SignInButton>`. 기존 익명 후기(`user_id = null`)는 읽기 전용. §18의 "익명 작성" 서술은 이 절로 대체.
- 후기 본문 **1000자 제한**(`<Textarea maxLength>` + 서버 `.slice(0, 1000)`). 스키마 변경 없음(`reviews.user_id`는 기존 컬럼).

**AI 장애 하드닝 — 일정 생성 (PR #57)**
- `genericDestination` 활동 5 → 15개, 소지역 5개로 분산. `generateItineraryFallback`의 재사용 블록은 목적 필터로 좁힌 pool이 아니라 **목적지 전체 카탈로그**를 훑어(1차 미사용 우선 → 2차 회전 재사용) 같은 장소가 여러 날 반복되거나 특정 area가 통째로 누락되던 문제를 해소.
- **모델 폴백 체인** — `src/lib/ai/model.ts`에 `smartModels`/`fastModels` 배열, `src/lib/ai/generate.ts` `generateTextWithFallback(models, call)`가 앞에서부터 시도(어떤 오류든 다음 모델). 전부 실패 시 결정론적 fallback. 폴백 모델명은 PR #59에서 정정(아래).
- **성공 일정 캐시** — 신규 테이블 `itinerary_plan_cache(key, plan jsonb, fetched_at)`. `key = requestSeedKey + "::must=" + sorted(mustIncludePlaceIds)`. AI 성공 시 항상 저장, **읽기는 2회 실패 분기에서만**(정상 경로 무변경). 캐시 히트 시 실제 일정 반환(`usedFallback=false`). 30일 TTL. `db:push` 적용 완료.
- **폴백 여부 영속화** — 신규 컬럼 `itineraries.used_fallback boolean`(nullable, null→false). `saveItinerary`/`updateItinerary`가 기록, `getItinerary`가 반환. 휘발성 `?fallback=1` 쿼리를 대체. `db:push` 적용 완료.
- **재생성** — `regenerateItineraryAction`(소유자 한정, `(id,userId)` 이중 검증)이 저장된 `request`로 재생성해 제자리 교체. 결과 페이지는 `used_fallback`이고 소유자면 "지금 다시 생성" CTA 노출, 결과는 `?regen=done|stillbusy|failed`(1회성).

**챗봇 지연 (PR #58)**
- 조건이 바뀌는 턴마다 모델을 2회 연속 호출(도구 호출 → 결과 재전송 → 답변)하던 것을, `sendAutomaticallyWhen`을 커스텀화해 **같은 턴에 답변 텍스트가 있으면 2번째 호출 생략**(도구만 있고 텍스트 없을 때만 재호출). 프롬프트에 "답변 먼저, 같은 턴에 `updateTripDraft`" 지시 추가. `streamText`에 `maxOutputTokens: 512`.

**모델 폴백 체인 정정 (PR #59)**
- PR #57이 폴백으로 넣은 `gemini-3.6-flash-lite`는 이 API 키에서 **404(존재하지 않는 모델)**라 체인이 무력했다. 프로덕션 키 직접 확인(2026-08-31): `gemini-3.6-flash`는 큰 구조화 출력 호출에서 **429 쿼터 초과**, `gemini-3.5-flash`/`gemini-3.5-flash-lite`는 정상.
- `smartModels` 폴백 → `gemini-3.5-flash`, `fastModels` 폴백 → `gemini-3.5-flash-lite`. primary는 여전히 `gemini-3.6-flash`(쿼터 풀리면 자동 복귀).
- **근본 병목은 무료 티어 일일 쿼터** — 체인·캐시는 완충일 뿐, 유료 키가 실제 해결책(미결). §20/§27.2의 "두 티어 모두 gemini-3.6-flash"는 여전히 primary 기준으로 유효.

---

## 부록 A — v2.5 → v3.0 핵심 차이

| 축 | v2.5 | v3.0 |
|---|---|---|
| 최상위 관점 | Place-first Search + API 호출량 분리(엔지니어링 중심) | 사용자의 한 문장 → 완성된 일정(UX 중심) |
| YouTube | "장소 우선 검색"의 1차 검색 수단 | 확정 일정지에 붙이는 보강 미디어. 관광공사/Knowledge/블로그가 우선 |
| Knowledge | PRD에서 거의 안 다룸 | 축적된 여행 지식으로 명시, A의 판단 강화 (§9) |
| Search 우선순위 | 캐시/Dedup/Queue 중심 | 국내/해외 소스 우선순위 사다리 명시 (§8) |
| Pipeline A/B | 언급 없음 | 하나의 사용자 흐름으로 통합 (§4, §11) |
| AI Provider | Gemini 3.6 Flash + Vercel AI Gateway 고정 | provider abstraction — Gemini API 직결(중계 계층 없음), 교체는 `src/lib/ai/model.ts` 한 곳 (§20) |
| 참고자료 | YouTube 3 + 블로그 3 | 4개 유형에서 품질순 1~3개 (§13) |
| 편집/후기/재사용 | 백로그 | MVP 흐름에 포함, 연결 과제 명시 (§16~§19) |
| 문서 구조 | 검색 아키텍처 → 데이터 모델 순 | 제품 경험 → 엔진 → 데이터 → 범위 순 |

## 부록 B — 그대로 재사용 가능한 핵심 자산

- `generateItinerary()` 전체 파이프라인 (AI 뼈대 + 소스 매칭 + 지오코딩 + 동선 정렬 + fallback)
- `verifiedPlaces`/`regionalKnowledge`/`mustIncludePlaceIds` A↔B 브릿지 (PHASE 14)
- TourAPI 장소 120건 + Knowledge 582행 + 검수 파이프라인(Q1~Q9)
- 지도 Provider 추상화, 지오코딩 Provider 추상화
- `source_cache` + `search_locks` + `api_rate_limits` + pre-fetch 크론
- 챗봇(`trip-chat`) 자연어 조건 파악
- `/plan/result/[id]` 결과 화면 + PDF + 공유 링크
- 대시보드 실데이터 집계 + `pipeline_b_events`

## 부록 C — v3.0에서 "연결만 해서" 완료한 부분

`dcbf94e`에서 세 가지 모두 반영됨 (§25):

- ✅ TourAPI/Knowledge → 일정지 **참고자료 카드** 노출 (프롬프트 유입 위에 화면 노출 추가)
- ✅ Search 우선순위 사다리 — 항목별 검색 전 "검증 장소에 매칭됐는가" 체크 한 단계
- ✅ 후기 → 일정 (`reviews.itineraryId` additive 컬럼)

## 부록 D — v3.0 MVP 신규 구현 (완료)

1. ✅ 일정지 참고자료 4-유형 통합 렌더링 (§25-1)
2. ✅ 지원 지역 항목의 조건부 YouTube 호출 스킵 (§25-2)
3. ✅ 결과 화면 자연어 수정 1턴 (§25-3)

## 부록 E — MVP에서 명확히 제외

대량 자동 검수, Knowledge scoring 고도화, 지역 대량 확장, 자동 학습, 예약/결제, 다국어, 네이티브 앱, Search Job Queue 분리, 드래그 편집 UI, 명시적 확정 상태 머신. (§26)
