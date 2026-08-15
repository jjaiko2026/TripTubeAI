# TripTube AI — 제품 요구사항 문서 (PRD)

## 1. 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | TripTube AI |
| 네이밍 유래 | Trip + YouTube + AI |
| 한 줄 정의 | 유튜브·블로그에 흩어진 여행 정보를 AI가 대신 검색·정리해서, 대화 또는 폼 입력 한 번으로 완성된 여행 일정을 만들어주는 웹앱 |
| 배포 링크 | https://triptube-ai.vercel.app |
| 팀명 | AI tour |
| 문서 버전 | **v2.5 (2026-08-15)** |
| 핵심 변경 | 장소 우선 검색(Place-first Search)으로 전환 + 목적지 국가→도시 확정 + 도착/출발 지점(공항·여객터미널·일반) 자동 고정 + YouTube API 저호출 + 캐시 + 동시 요청 Deduplication + Search Job Queue + Rate Limiter + 인기 여행지 Pre-fetch |

> 핵심 원칙: **① 일정 항목의 소스는 그 장소 자체를 검색해서 정확도를 우선한다. ② 사용자 수와 외부 검색 API 호출량은 분리한다.**
> 동일하거나 유사한 검색 요청은 공유하고, 캐시가 있으면 API를 호출하지 않는다. 장소 전용 검색도 반드시 캐시·락·Rate Limiter를 거친 뒤에만 실제 API를 호출한다.

## 2. 문제 정의

여행자는 YouTube와 블로그를 여러 개 검색·시청하면서 정보를 모으지만, 본 내용을 잊고 정보가 흩어지며 검색·비교에 많은 시간이 든다. 같은 정보의 복제 콘텐츠와 광고성 콘텐츠도 많다. 최종적으로 조사한 정보가 하나의 실행 가능한 일정으로 정리되지 않는 문제를 해결한다.

TripTube AI는 여행 조건과 여행 목적을 검색 의도로 변환하고, 외부 콘텐츠를 후보로 확보한 뒤 중복 제거·품질 평가·장소 매칭·동선 최적화를 거쳐 일정으로 재구성한다.

목적지 단위(예: "다낭 가족여행")로만 검색을 압축하면 실제 일정에 없는 인근/전역 콘텐츠가 항목에 잘못 붙는 문제가 있었다. v2.5부터는 AI가 확정한 일정 항목의 장소명 자체를 1차 검색어로 쓰고, 목적지 단위 검색은 장소 검색이 부족할 때만 보충으로 쓴다.

다수 사용자가 동시에 이용하는 상황을 고려해 Cache, Request Deduplication, Search Job Queue, API Rate Limiter, 인기 여행지 Pre-fetch를 적용한다.

## 3. 목표

1. 여행지·지역·인원·기간·시기·목적을 바탕으로 실제 콘텐츠를 근거로 여행 일정을 생성한다.
2. YouTube 영상, 네이버 블로그 출처와 지도 동선을 결과에 제공한다.
3. 여행 목적이 검색어, 콘텐츠 랭킹, 일정 구성에 직접 반영된다.
4. 일정 항목의 출처는 그 항목이 가리키는 실제 장소를 검색어로 우선 확보한다(목적지 단위로 뭉뚱그리지 않는다).
5. 장소 전용 검색은 여행 1건당 최대 30곳으로 제한하고, 그래도 부족한 항목만 목적지 단위 보충 검색(최대 4개 쿼리)으로 채운다.
6. 검색 1회당 최대 50개 후보를 확보하고 추가 페이지 호출은 기본적으로 하지 않는다.
7. 동일 검색 요청은 여러 사용자가 요청해도 하나의 검색 작업으로 통합한다.
8. 충분한 캐시가 있으면 외부 API 호출을 하지 않는다. 같은 장소를 검색하는 다른 사용자/여행끼리 캐시를 공유해, 인기 장소일수록 신규 호출이 줄어든다.
9. 인기 여행지는 백그라운드에서 미리 수집한다.
10. API 실패·quota 부족에도 일정 생성 전체가 중단되지 않는다.
11. 서비스가 커져도 API 호출량이 사용자 수에 단순 비례하지 않도록 한다.
12. 목적지를 나라 단위(예: "베트남")로만 입력하면 도시 단위로 확정하도록 유도해, 검색 범위와 쿼터 사용을 좁힌다.
13. 모든 일정은 실제 도착/출발 지점(해외·제주도는 공항, notes에 배편 언급 시 여객터미널, 그 외 국내는 일반 도착/출발)으로 시작·종료한다.

### Non-goals
- 항공권/숙박 예약·결제
- 1차 다국어 지원
- 네이티브 앱
- PDF/이미지 내보내기
- YouTube 웹 크롤링 또는 비공식 API 우회
- 영상 전체 다운로드·재배포

## 4. 타깃 사용자

- 여행 계획 초기 단계에서 YouTube·블로그를 순회하는 20~40대 여행자
- 짧은 시간에 여행 초안을 받고 싶은 사용자
- 자연어로 여행 조건을 설명하고 싶은 사용자
- 여러 콘텐츠를 직접 비교·정리하기 번거로운 사용자

## 5. 사용자 흐름

```text
방문 → 랜딩
 ├─ 비로그인 → /plan/example → 로그인 유도
 └─ 로그인 → /plan/new
                    ↓
             폼 또는 챗봇
                    ↓
             TripRequest 확정
                    ↓
       목적 + 우선순위 분석
                    ↓
              SearchPlan
                    ↓
        검색어 정규화 + Cache
                    ↓
          ┌─────────┴─────────┐
          │                   │
      캐시 충분             캐시 부족
          │                   │
       캐시 사용          Search Job Queue
                              ↓
                     Request Deduplication
                              ↓
                        API Rate Limiter
                              ↓
                      YouTube / Naver
                              ↓
                       source_cache
                              ↓
                    후보 통합·중복 제거
                              ↓
                        자체 랭킹
                              ↓
                       장소 매칭
                              ↓
                  좌표 검증 + 2-opt
                              ↓
                     일정 저장/결과
```

## 6. 기능 요구사항

### 6.1 랜딩
- 문제 상황 Before/After
- `/plan/example` 캐시 샘플
- 방문자/일정 생성 등 신뢰 지표
- 후기
- 로그인 CTA

### 6.2 인증
- Clerk
- 이메일/비밀번호 + Google
- 실제 일정 생성은 로그인 사용자
- 비로그인은 예시 일정

### 6.3 여행 일정 요청 폼
- 국내/해외 — 전환 시 이전 지역의 여행지는 비워서 사용자가 새로 지정하게 한다(예: 국내 → 해외 전환 시 "제주도"가 남아있지 않게).
- 여행지 — 자유 입력. "베트남"처럼 나라 단위로만 입력하면 대표 도시 목록(예시일 뿐이며 목록 밖 도시도 직접 입력 가능)을 보여주고 구체적인 도시로 확정하도록 안내한다(§6.4 챗봇도 동일).
- 구성원: 혼자/친구/가족/연인/동료
- 인원
- 숙박 일수
- 여행 시기(월)
- 여행 목적
- 목적 우선순위
- 추가 요청사항 — 특정 장소/맛집 지정 외에, 배·여객선 등 이동수단 언급 시 도착/출발 지점 산정에도 반영된다(§19).

### 여행 목적 10개

| ID | 표시명 | 검색 의도 |
|---|---|---|
| food | 🍜 맛집·미식 | 맛집, 현지음식, 먹거리 |
| healing | 🏖️ 휴양·힐링 | 휴양, 힐링, 리조트, 온천 |
| nature | 🏞️ 자연·풍경 | 자연, 바다, 산, 해변, 전망 |
| attraction | 📸 관광·명소 | 관광지, 명소, 랜드마크 |
| cafe | ☕ 카페·감성 | 카페, 오션뷰, 감성카페 |
| activity | 🎢 액티비티·체험 | 레저, 스포츠, 체험 |
| culture | 🏛️ 문화·역사 | 역사, 문화, 유적, 박물관 |
| shopping | 🛍️ 쇼핑 | 쇼핑몰, 시장, 기념품 |
| festival | 🎉 축제·공연·이벤트 | 축제, 공연, 행사 |
| nightlife | 🌙 야경·나이트라이프 | 야경, 야시장, 밤거리 |

동행 유형과 여행 목적은 분리한다.

목적 우선순위:
- core = 1.0
- important = 0.7
- normal = 0.4
- 최대 3개 핵심 목적 지정

### 6.4 챗봇
- Gemini 3.6 Flash + Vercel AI Gateway
- 자연어 조건 파악
- `updateTripDraft`로 폼 실시간 반영
- 목적 → 목적 ID + 우선순위
- 동명이 지역, 나라 단위 입력 모두 되물어서 구체적인 도시로 재확인

## 7. 검색 아키텍처

### 7.1 핵심 원칙
**사용자 수 ≠ YouTube API 호출 수**

잘못된 구조:
```text
사용자 100명 → 각자 일정 항목 검색 → API 폭증
```

올바른 구조:
```text
100명 → SearchKey 정규화 → Cache/Dedup → 필요한 검색만 Queue
      → Rate Limiter → API → 공용 Cache → 여러 사용자 재사용
```

### 7.2 SearchPlan (보충용)

AI가 일정 항목의 장소를 먼저 확정한 뒤에 소스를 찾으므로, SearchPlan은 더 이상 1차 검색 수단이 아니다.
장소 전용 검색(§7.4)으로 채우지 못한 항목이 있을 때만 아래 목적지 단위 쿼리로 넓혀서 보충한다.

```ts
type SearchPlan = {
  primaryQueries: string[];     // 기본 2~3개
  fallbackQueries: string[];    // 필요할 때만
  purposeGroups: string[];
  cacheKeys: string[];
};
```

예:
```text
제주도 가족여행 3박4일
제주도 가족여행 맛집 자연
제주도 가족여행 카페
```

10개 목적을 10번 검색하지 않는다.

### 7.3 목적 그룹화
```text
음식 = food
휴양 = healing
관광 = nature + attraction
감성 = cafe
체험 = activity
문화 = culture
소비 = shopping
이벤트 = festival
야간 = nightlife
```

### 7.4 장소 우선 검색 (Place-first Search)

**1차 검색 수단.** AI가 확정한 일정 항목마다 그 항목의 장소명을 그대로 검색어로 써서
`{목적지명} {장소명}`(예: `하노이 탕롱수상인형극장`) 쿼리를 만든다. 목적지 단위로만 검색하면
그 목적지에서 흔히 같이 묶이는 인근/전역 콘텐츠(예: 다낭 일정에 호이안·바나힐, 하노이
일정에 골프 풀빌라 광고성 콘텐츠)가 섞여 들어오는 문제를 근본적으로 줄인다.

배정 순서:
1. **정확 매칭**: 모든 항목에 대해 그 장소 전용 검색 결과부터 배정한다. 항목 하나가 부족하다고
   바로 다른 장소 소스로 채우면 뒤 순서 항목이 가질 수 있었던 정확한 소스를 가로챌 수 있으므로,
   전체 항목의 장소 전용 배정이 끝난 뒤에만 다음 단계로 넘어간다.
2. **넓히기**: 장소 전용 검색만으로 못 채운 항목만 §7.2 SearchPlan의 목적지 단위 공유 풀로 보충한다.
3. **목업 대체**: 그래도 부족하면 관련 없는 실제 소스를 억지로 붙이는 대신 플레이스홀더로 채운다.

장소 전용 검색도 §9 Cache·§10 Dedup·§12 Rate Limiter를 그대로 통과하므로, 같은 장소를 검색하는
다른 사용자/여행끼리 캐시를 공유한다. 여행 1건당 장소 전용 쿼리는 최대 30개(`MAX_PLACE_SEARCH_QUERIES`)로
제한해, 아주 긴 일정(폼상 최대 30박)에서도 한 번에 너무 많은 동시 검색 호출이 나가지 않게 한다.

## 8. 검색어 정규화

자유 문장보다 구조화된 조건을 우선해 canonical key를 만든다.

```ts
type SearchKey = {
  source: "youtube" | "blog";
  destination: string;
  memberType?: string;
  nights?: number;
  month?: number;
  purposeGroups: string[];
  regionCode?: string;
  language?: string;
};
```

예:
```text
youtube::제주도::family::food::KR::ko
```

## 9. Cache

조회 순서:
1. 정확히 일치하는 캐시
2. 목적지 + 목적 그룹
3. 목적지 일반 여행
4. Pre-fetch 데이터
5. 부족하면 외부 API

`source_cache`:
```text
cacheKey PK
sourceType
normalizedQuery
searchContext jsonb
sources jsonb
fetchedAt
expiresAt
```

기본 TTL:
- YouTube 30일
- 블로그 7~30일
- 여행 전 정보 7일
- Pre-fetch는 별도 갱신 주기

TTL은 환경변수로 조정한다.

## 10. Request Deduplication

동시에 같은 검색이 들어오면 하나의 Job만 실행한다.

```text
A ─┐
B ─┤
C ─┼→ 제주도 가족여행 맛집
D ─┤
E ─┘
       ↓
   Search Job 1개
       ↓
   API 1회
       ↓
   DB 저장
       ↓
 A/B/C/D/E 공유
```

상태:
`PENDING → RUNNING → COMPLETED / FAILED`

RUNNING인 동일 SearchKey가 있으면 새 API 호출을 만들지 않고 기존 결과를 기다린다.

## 11. Search Job Queue

목적: 사용자 요청과 외부 API 호출을 분리한다.

```text
사용자 → SearchPlan → Cache → 부족분 Job
                         ↓
                       Queue
                         ↓
                       Worker
                         ↓
                   Rate Limiter
                         ↓
                    External API
```

Job:
```ts
type SearchJob = {
  id: string;
  sourceType: "youtube" | "blog";
  cacheKey: string;
  query: string;
  status: "pending" | "running" | "completed" | "failed";
  priority: "user" | "prefetch" | "refresh";
  attempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
};
```

우선순위:
1. 현재 사용자가 기다리는 검색
2. 동일 요청의 다른 사용자
3. 인기 여행지 Pre-fetch
4. 오래된 캐시 갱신

## 12. API Rate Limiter

모든 YouTube API 호출은 중앙 Rate Limiter를 통과한다.

환경변수 예:
```text
YOUTUBE_DAILY_SEARCH_LIMIT
YOUTUBE_MAX_SEARCH_PER_JOB
YOUTUBE_MAX_CONCURRENT_JOBS
```

quota는 실제 Google Cloud 프로젝트 설정에 맞춰 조정한다.

## 13. YouTube API 정책

- `search.list`
- `maxResults=50`
- `type=video`
- 한국어/한국 지역 기준 `regionCode=KR`, `relevanceLanguage=ko`
- `order=relevance`
- 장소 전용 검색: 여행 1건당 고유 장소 수만큼(최대 30회), 캐시/락/일일 쿼터로 보호
- 목적지 단위 보충 검색: 장소 전용 검색으로 못 채운 항목이 있을 때만, 최대 4개 쿼리
- 일일 쿼터(`YOUTUBE_DAILY_SEARCH_LIMIT`, 기본 200) 초과 시 그 쿼리는 YouTube를 건너뛰고 네이버/목업으로만 채움
- 추가 `pageToken` 호출은 기본적으로 하지 않음

후보:
```text
장소 쿼리(항목별) 최대 50
+ 보충 쿼리(목적지 단위, 최대 4개) 각 최대 50
→ videoId 중복 제거
→ 내부 랭킹
```

## 14. YouTube 상세 조회

`videos.list`는 videoId를 묶어서 호출한다.

```text
50 videoId → videos.list 1회
```

`video_detail_cache`:
```text
videoId PK
snippet jsonb
statistics jsonb
contentDetails jsonb
fetchedAt
expiresAt
```

## 15. 자체 후보 랭킹

평가:
- 여행지 일치
- 목적 일치
- 동행 유형
- 장소명
- 여행 시기
- 최신성
- 참여도
- 채널 다양성
- 중복 여부
- 관리자 검수

예:
```text
destinationMatch * 0.30
purposeMatch      * 0.25
tripStyleMatch    * 0.15
placeMatch        * 0.15
freshness         * 0.05
engagement        * 0.05
sourceDiversity   * 0.05
```

목적 `core`는 관련도 가중치를 높인다.

이 랭킹은 §7.4의 정확 매칭/넓히기 각 단계 안에서 후보를 정렬하는 데 쓰인다. 즉 넓히기 단계로
넘어간 항목도 목적지 단위 풀 안에서는 이 점수로 가장 잘 맞는 것부터 고른다.

## 16. 광고성·복제 콘텐츠

확정 판정이 아니라 감점 방식:
- 광고/구매 유도 표현
- 협찬 패턴
- 동일 문구 반복
- 동일 장소 반복
- 상품 판매 중심
- 동일 채널 유사 콘텐츠 과다

## 17. 인기 여행지 Pre-fetch

예:
```text
제주도 / 부산 / 서울 / 강릉 / 경주
도쿄 / 오사카 / 후쿠오카 / 다낭 / 방콕 / 몽골
```

목적 그룹별 검색 결과를 백그라운드에서 수집해 `source_cache`에 저장한다.

원칙:
- 사용자 요청보다 낮은 우선순위
- quota 여유가 있을 때만
- 최신 캐시는 다시 수집하지 않음
- 인기 여행지/목적에 따라 동적으로 우선순위 조정

## 18. 검색 결과 공유

검색 결과는 사용자별로 복제하지 않고 공용 Cache를 사용한다.

```text
Search Cache
 ├─ User A
 ├─ User B
 └─ User C
```

사용자 일정 자체는 `itineraries`에 개인별 저장한다.

## 19. AI 일정 생성 순서

1. TripRequest 확정 (여행지가 나라 단위면 도시로 먼저 확정)
2. 목적 및 우선순위 분석
3. Claude Sonnet 5가 `dayRegions`와 일정 뼈대 생성. 1일차 첫 항목은 도착, 마지막 날 마지막
   항목은 출발로 고정(해외·제주도는 공항, notes에 배편 언급 시 여객터미널, 그 외 국내는
   일반 도착/출발 — notes에 실제 교통수단이 언급되면 항상 그쪽을 우선)
4. 항목별 장소 전용 검색(§7.4 1차) — 캐시 우선 조회 → 락 → Rate Limiter
5. 부족한 항목만 SearchPlan(§7.2 보충)으로 목적지 단위 검색
6. Dedup(§10) + Search Job Queue(§11)로 동시 요청 통합
7. 후보 통합/중복 제거
8. 랭킹(§15)
9. 정확 매칭 우선 배정 → 부족분만 넓히기 → 그래도 부족하면 목업 대체
10. 좌표 지오코딩
11. 좌표 검증
12. 2-opt 동선 최적화
13. Neon 저장
14. 결과 제공

## 20. 지도/장소

- 국내: Naver 지역검색/Naver Maps
- 해외: Google Geocoding/Google Maps
- 행정구역 수준의 부정확한 좌표 제거
- 일차별 지도 토글
- 마커 겹침 보정
- 하루 단위 2-opt

## 21. 결과 화면

`/plan/result/[id]`
- 여행 전 정보
- 일자별 타임라인
- YouTube 출처 최대 3개
- 블로그 출처 최대 3개
- 지도 동선
- 일차 토글
- 마커 보정
- 일정 저장
- 공유/PDF/이미지 내보내기는 백로그

## 22. 데이터 모델

### itineraries
```text
id, userId, destination, destinationName, region,
memberType, memberCount, nights, month, purposes,
notes, days, estimatedTotalCost, currency, tripTips, createdAt
```

### source_cache
```text
cacheKey PK
sourceType
normalizedQuery
searchContext jsonb
sources jsonb
fetchedAt
expiresAt
```

### video_detail_cache
```text
videoId PK
snippet jsonb
statistics jsonb
contentDetails jsonb
fetchedAt
expiresAt
```

### search_jobs
```text
id PK
sourceType
cacheKey
query
status
priority
attempts
createdAt
startedAt
completedAt
error
```

### search_locks
```text
cacheKey PK
jobId
status
lockedAt
expiresAt
```

### content_moderation
```text
sourceId PK
status
updatedAt
```

### trip_tips_cache
```text
key PK
tips jsonb
fetchedAt
expiresAt
```

## 23. 앱 내부 타입

```ts
type TravelPurposeId =
  | "food" | "healing" | "nature" | "attraction" | "cafe"
  | "activity" | "culture" | "shopping" | "festival" | "nightlife";

type TravelPurpose = {
  id: TravelPurposeId;
  priority: "core" | "important" | "normal";
};

type TripRequest = {
  destination: string;
  region: "domestic" | "international";
  memberType: "solo" | "friend" | "family" | "couple" | "colleague";
  memberCount: number;
  nights: number;
  month: number;
  purposes: TravelPurpose[];
  notes?: string;
};

type Source = {
  sourceId: string;
  sourceType: "youtube" | "blog";
  title: string;
  channelOrSite: string;
  url: string;
  thumbnailUrl?: string;
  description?: string;
  publishedAt?: string;
  relevanceScore?: number;
  qualityScore?: number;
};

type SearchPlan = {
  primaryQueries: string[];
  fallbackQueries: string[];
  purposeGroups: string[];
  cacheKeys: string[];
};
```

## 24. 기술 스택

| 영역 | 스택 |
|---|---|
| 프레임워크 | Next.js 16 + React 19 + TypeScript |
| UI | Tailwind CSS v4, shadcn/ui + Base UI |
| 차트 | Recharts |
| AI | Vercel AI SDK v7 + Vercel AI Gateway, Claude Sonnet 5, Gemini 3.6 Flash, Zod |
| 인증 | Clerk |
| DB | Neon Serverless Postgres + Drizzle ORM |
| 외부 API | YouTube Data API v3, Naver 지역검색/블로그 검색 API, Naver Maps JS SDK, Google Geocoding API, Google Maps JavaScript API |
| 배포 | Vercel |
| 캐시 | Neon Postgres |
| Queue | 초기 Neon 기반 `search_jobs` + lock, 트래픽 증가 시 전용 Durable Queue/Job 계층으로 교체 가능 |
| 검색 계층 | `SearchProvider` 추상화 |

기존 프로젝트 설명서의 기술 스택과 API 구성을 유지한다.

## 25. API 효율 KPI

```text
YouTube Cache Hit Rate                    ≥ 70%
캐시로 완전 처리되는 요청                ≥ 50%
일정 1건 최대 신규 search.list 호출 수     ≤ 34회 (장소 전용 최대 30 + 보충 최대 4)
장소 전용 쿼리 캐시 재사용율               인기 목적지일수록 상승 추세로 관리
추가 pageToken 호출률                      ≈ 0%
동일 검색 동시 중복 호출                   = 0건
API quota 초과 실패율                      < 1%
```

v2.4까지의 "일정 1건 평균 search.list ≤ 1.5회" 목표는 목적지 단위 압축 검색에서만 성립했다.
v2.5는 장소 전용 검색이 1차 수단이라 여행 1건의 신규 호출 수는 그 여행에 처음 등장하는(=아직
캐시에 없는) 장소 수에 좌우된다. 대신 캐시 TTL(30일)과 장소 단위 캐시 공유로, 인기 목적지·인기
장소일수록 다른 사용자/여행의 요청이 캐시를 재사용해 신규 호출이 줄어드는 것을 목표로 한다.

확장성 KPI:
- 동시 일정 생성 요청 수
- Queue 대기 p50/p95
- Search Job 처리 시간
- Rate Limiter 대기 시간
- Dedup 비율
- Pre-fetch 활용률

## 26. 대시보드

기존 지표에 다음 추가:
- 일정 생성 요청 수
- 실제 YouTube API 호출 수
- Cache Hit Rate
- Search Job 수
- Dedup된 검색 요청 수
- 평균 Queue 대기 시간
- 평균 API 호출 수/일정
- API quota 사용량
- API 오류 수
- Pre-fetch 처리량

## 27. 리스크 및 대응

### YouTube quota
장소 전용 검색 여행당 상한(30개), 목적지 단위 보충 검색 압축(최대 4개), 50개 확보, pageToken 제한, Cache, Dedup, Queue, Rate Limiter, Pre-fetch, Batch 조회로 대응. 일일 쿼터 초과 시 해당 쿼리는 YouTube를 건너뛰고 네이버/목업으로 대체한다.

### 동시 사용자 폭증
Queue, Single-flight, Cache 공유, API 동시 호출 제한, 사용자 요청 우선순위로 대응.

### API 우회 위험
YouTube 웹 크롤링 및 비공식 API 사용 금지. 공식 API만 사용.

### 캐시 최신성
TTL, 주기적 갱신, freshness 점수, 원본 URL 검증.

### AI 환각
실제 검색 후보/지역 데이터 연결, 출처 표시, 좌표 검증.

### 검색 품질
API 호출 감소가 후보 품질 감소로 이어지지 않도록 공용 검색 DB를 축적하고 내부 랭킹을 고도화한다.

## 28. 로드맵

### Phase 1~4 — 기존 완료
- UI/UX
- YouTube/Naver/지도/AI 연동
- Clerk
- Neon/Drizzle
- 챗봇
- 지도 일차 토글/마커 보정
- 최근 일정
- Vercel 배포

### Phase 5 — 검색 엔진 전환
1. 여행 목적 10개 + 우선순위
2. 목적 그룹
3. SearchPlan
4. 검색어 정규화
5. source_cache
6. 일정 항목별 검색 제거
7. 2~3개 핵심 검색
8. 50개 결과
9. videoId batch
10. 자체 랭킹

### Phase 6 — 다중 사용자 확장
1. search_jobs
2. Request Deduplication
3. Search Lock
4. Queue Worker
5. Rate Limiter
6. 재시도/실패 정책
7. 사용자 우선순위
8. API 모니터링

### Phase 7 — Pre-fetch
- 인기 여행지/목적 집계
- 사전 검색 스케줄러
- 캐시 갱신
- quota 여유분 기반 자동 조절

### Phase 8 — 품질 개선
- 광고성/복제 콘텐츠
- 목적별 랭킹
- 채널 다양성
- 사용자 피드백 기반 랭킹

### Phase 9 — 예정
- 일정 공유
- PDF/이미지 내보내기
- 예약 연동 검토

### Phase 10 — 장소 우선 검색 전환 (완료, v2.5)
1. 항목별 장소 전용 검색을 1차 수단으로 전환(§7.4)
2. 정확 매칭 우선 배정 → 넓히기 → 목업 대체 2단계 로직
3. SearchPlan을 목적지 단위 보충(fallback) 전용으로 축소
4. 장소 전용 쿼리 여행당 최대 30개 상한(`MAX_PLACE_SEARCH_QUERIES`)

### Phase 11 — 목적지/동선 정확도 (완료, v2.5)
1. 나라 단위 목적지 입력을 도시 단위로 확정하도록 폼/챗봇에 안내(§6.3)
2. 여행 지역(국내/해외) 전환 시 여행지 입력 초기화
3. 1일차 첫 항목/마지막 날 마지막 항목을 도착/출발 지점으로 고정(§19)
4. notes의 배·여객선 언급을 감지해 공항 대신 여객터미널로 전환

## 29. 개발자가 반드시 지켜야 할 규칙

### Rule 1
**일정 항목의 소스는 그 장소를 직접 검색하되(§7.4), 항상 공용 캐시·락·Rate Limiter를 거친
뒤에만 실제 API를 호출한다.** 항목별로 미가공(unprotected) YouTube API를 직접 호출하지 않는다
— 캐시 미스일 때만, 그것도 락으로 동시 중복 호출을 막은 뒤 Rate Limiter를 통과해야 호출한다.

### Rule 2
**사용자마다 같은 검색을 반복하지 않는다.**

### Rule 3
**Cache Hit이면 API를 호출하지 않는다.**

### Rule 4
**동일 SearchKey가 RUNNING이면 새 Job/API 호출을 만들지 않는다.**

### Rule 5
**외부 API 호출은 Rate Limiter를 통과한다.**

### Rule 6
**UI 컴포넌트에서 YouTube API를 직접 호출하지 않는다.**

```text
UI → Server → Search Service → Cache → Queue → Rate Limiter → Provider → API
```

### Rule 7
API 실패가 일정 생성 실패를 의미하지 않는다.

```text
API 성공 → 최신 결과
API 실패 → Cache
Cache 없음 → 승인 소스
그래도 없음 → 부분/목업 결과
```

### Rule 8
YouTube API 우회를 위해 웹 크롤링하지 않는다.

## 30. 참고 구현

```ts
async function getSources(plan: SearchPlan) {
  const cached = await getCachedSources(plan);

  if (isEnough(cached)) {
    return rankSources(cached);
  }

  const missingQueries = getMissingQueries(plan, cached);
  const jobs = await enqueueDeduplicatedJobs(missingQueries);
  const newSources = await waitForJobs(jobs);

  return rankSources([...cached, ...newSources]);
}
```

## 31. 최종 제품 정의

TripTube AI는 단순히 YouTube 검색 결과를 많이 보여주는 서비스가 아니다.

> **여행자의 목적을 이해하고, YouTube·블로그에 흩어진 정보를 효율적으로 수집한 뒤, 중복·저품질 정보를 줄이고 실제 출처가 붙은 여행 일정으로 변환하는 AI 여행 플래너다.**

핵심:

```text
사용자 조건 + 여행 목적
        ↓
AI 일정 뼈대 생성 (장소 확정 + 도착/출발 지점 고정)
        ↓
항목별 장소 전용 검색 (1차) + 부족분만 목적지 단위 보충 (2차)
        ↓
Cache
        ↓
부족분만 Queue
        ↓
Deduplication
        ↓
Rate Limiter
        ↓
YouTube / Naver
        ↓
공용 Cache
        ↓
후보 통합 / 랭킹
        ↓
정확 매칭 우선 배정 → 넓히기 → 목업 대체
        ↓
지도 / 동선 최적화
        ↓
여행 일정 완성
```

**v2.5의 최우선 목표는 일정 항목과 소스의 정확도를 우선하면서, 사용자 수와 외부 API 호출량은 계속 분리하는 것이다.**
장소를 직접 검색해 정확도를 확보하되, 같은 장소를 검색하는 여러 사용자/여행은 캐시를 공유하고, 인기 여행지는 사전 수집하며, 캐시에 없는 검색만 Queue를 통해 제한적으로 수행한다.
