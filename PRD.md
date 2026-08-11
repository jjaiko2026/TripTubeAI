# TripTube AI — PRD

## 1. 개요

TripTube AI는 유튜브 영상과 네이버 블로그 글을 뒤져가며 여행 일정을 짜는 수고를 없애주는 서비스다. 여행 조건(목적지·인원·기간·시기·목적)을 입력하면 AI가 실제 검색된 유튜브/블로그 자료를 근거로 일자별 일정을 만들어주고, 각 일정 항목에는 그 활동과 실제로 관련 있는 출처(영상/게시글) 링크가 함께 붙는다.

- **배포 URL**: https://triptube-ai.vercel.app
- **저장소**: https://github.com/jjaiko2026/TripTubeAI
- **인프라**: Vercel (Next.js), Neon Postgres, Vercel AI Gateway, Clerk

## 2. 타깃 사용자

- 국내/해외 여행을 계획 중이며, 유튜브·블로그를 오가며 정보를 모으는 수고를 줄이고 싶은 개인 여행자
- 혼자/친구/가족/연인/동료 등 다양한 구성으로 여행하는 사용자

## 3. 핵심 사용자 플로우

```
방문 → (비로그인) 예시 일정 확인 → 로그인 → 조건 입력 → AI 일정 생성 → 결과 확인/공유
                                                              ↓
                                                        후기 열람/작성
```

1. **비로그인 사용자**는 `/plan/example`에서 고정된 예시 일정(제주도, 연인, 3박4일, 힐링·맛집)을 보고 서비스를 체험한다.
2. **로그인**(Clerk)하면 `/plan/new`에서 여행 조건(목적지, 구성원 유형/인원, 숙박일수, 시기, 목적 태그)을 입력할 수 있다.
3. 조건을 제출하면 AI가 일정을 생성해 DB에 저장하고, `/plan/result/[id]`로 이동해 영구적으로 조회 가능한 결과를 보여준다.
4. 사용자는 `/reviews`에서 다른 사람의 후기를 보거나 직접 후기를 남길 수 있다.
5. `/dashboard`에서 서비스 이용 현황(방문자, 일정 생성 수, 인기 여행지, 여행지별 평균 비용)을 확인할 수 있다.

## 4. 기능 명세

### 4.1 인증 (Clerk)
- Clerk 기반 로그인/회원가입 (`/sign-in`, `/sign-up`)
- `clerkMiddleware`로 전역 라우트 보호, `/plan/new` 등은 비로그인 시 예시 페이지로 리다이렉트

### 4.2 AI 여행 일정 생성
- **모델**: Vercel AI Gateway 경유 `anthropic/claude-sonnet-5` (`src/lib/itinerary.ts`)
- 입력 조건 + 목적지 대표 활동 후보(`src/lib/mock/destinations.ts`)를 참고해 일자별 시간/제목/설명/태그로 구성된 일정 뼈대를 생성
- AI 호출 실패 시(쿼터 초과, 네트워크 오류 등) 결정론적 시드 기반 템플릿 로직으로 자동 폴백 — 항상 결과를 반환
- 예상 총 비용은 AI가 아닌 목적지별 평균 비용 데이터로 계산 (환각 방지)

### 4.3 실제 출처 매칭 (유튜브 · 네이버 블로그)
- 일정 항목마다(제목이 같으면 캐시 재사용) `"{목적지} {항목 제목}"`으로 실제 검색을 수행해, 그 활동과 실제로 관련 있는 영상/블로그를 최대 3개까지 붙인다 (여행 전체에 대한 뭉뚱그린 검색이 아님)
- **YouTube Data API v3**: 최근 1년 이내 영상만
- **NAVER API HUB 블로그 검색**: `naverapihub.apigw.ntruss.com/search/v1/blog`, `X-NCP-APIGW-API-KEY(-ID)` 인증 (구 `openapi.naver.com` 방식에서 마이그레이션)
- 여행 1건당 실제 검색은 최대 30개 고유 항목까지 수행(일반적인 3~4박 여행은 전부 실검색, 그 이상 긴 여행이거나 API 키가 없거나 결과가 부족하면 항목 제목 기반 목업 검색으로 자연스럽게 채워짐)
- 결과 카드는 유튜브는 실제 썸네일, 블로그는 실제 링크/스니펫을 보여줌 (`src/components/itinerary/source-card.tsx`)
- Trip.com·Agoda 등 OTA 리뷰는 공식 API가 없어(비공식 스크래퍼만 존재) 도입하지 않음. Google Places 리뷰는 1,000건당 $40(Enterprise+Atmosphere)로 비용이 커 보류

### 4.4 일정 동선 지도
- 일정 결과 화면 상단에 국내/해외 여부에 따라 지도를 다르게 렌더링 (`src/components/itinerary/itinerary-map.tsx`)
  - **국내** (`destination.region === "국내"`): Naver Maps JS SDK (Web 동적 지도)
  - **해외**: Google Maps JavaScript API
- 항목별 좌표는 생성 시점에 서버에서 미리 조회해 DB에 함께 저장 (지도를 열 때마다 다시 조회하지 않음)
  - 국내: NAVER 지역검색(Local Search) API. 활동 서술어("산책", "투어" 등)가 붙으면 매칭이 실패해서, 제목 뒷단어부터 하나씩 줄여가며 핵심 장소명만 남을 때까지 재시도
  - 해외: Google Geocoding API. 서술어가 섞인 문장도 안정적으로 처리되어 별도 재시도 로직 불필요
- 좌표를 못 찾은 항목은 지도에서 빠지고(에러 처리 없이 조용히 스킵), 전 항목이 실패하면 지도 대신 빈 상태 문구를 보여줌
- 마커는 일정 순서대로 번호가 매겨지고 Polyline으로 연결되어 동선을 나타냄; 지도 컨테이너는 `ResizeObserver`로 크기 변화 시 재배치되어 반응형으로 동작

### 4.5 일정 영속화
- 생성된 일정은 Neon Postgres `itineraries` 테이블에 저장되고 `/plan/result/[id]`로 영구 조회 가능 (기존 base64 토큰 인코딩 방식에서 전환 — 공유 링크가 항상 안정적으로 동작)
- 로그인 사용자는 `userId`가 함께 저장됨(비로그인 생성은 현재 UI 플로우상 발생하지 않음)

### 4.6 후기
- `reviews` 테이블 기반 실사용자 후기 작성/조회 (`/reviews`)
- 작성 폼은 낙관적 UI 업데이트 + 서버 액션(`createReviewAction`)으로 DB 저장
- 로그인 사용자는 `userId`가 함께 기록되지만, 작성 자체는 비로그인도 가능(이름 직접 입력)
- 홈페이지 하단에 최신 후기 3건 노출

### 4.7 대시보드
- 최근 30일 방문자/일정 생성 추이, 여행 목적 비중, 여행지별 평균 비용, 인기 여행지 Top 5
- **현재 전량 목업 데이터**(`src/lib/mock/stats.ts`) — 실제 이벤트 트래킹 미연동 (§7 참고)

## 5. 데이터 모델 (Neon Postgres, Drizzle ORM)

`src/db/schema.ts`

**itineraries**
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid, PK | |
| user_id | text, nullable | Clerk userId |
| destination / destination_name | text | 입력값 / 해석된 목적지명 |
| region | text | "국내" \| "해외" (지도 provider 분기용) |
| member_type, member_count, nights, month | text/int | 여행 조건 |
| purposes | jsonb (string[]) | |
| days | jsonb | 일자별 일정 전체(항목+출처 3개+좌표 포함) |
| estimated_total_cost | int | KRW |
| currency | text | 기본 "KRW" |
| created_at | timestamptz | |

**reviews**
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid, PK | |
| user_id | text, nullable | |
| author, destination, title, content | text | |
| rating | int | 1~5 |
| trip_month, nights | int | |
| created_at | timestamptz | |

## 6. 기술 스택

- **프레임워크**: Next.js 16 (App Router, Turbopack), React 19
- **UI**: Tailwind CSS v4, shadcn 계열 컴포넌트, Recharts
- **인증**: Clerk (`@clerk/nextjs`)
- **DB/ORM**: Neon Postgres (서버리스), Drizzle ORM (`@neondatabase/serverless`, `drizzle-orm`, `drizzle-kit`)
- **AI**: Vercel AI Gateway, `ai` SDK (`generateText` + `Output.object`), 모델 `anthropic/claude-sonnet-5`
- **외부 API**: YouTube Data API v3, NAVER API HUB (블로그·지역검색), Naver Maps JS SDK, Google Maps JavaScript API, Google Geocoding API
- **배포**: Vercel (Production: `triptube-ai.vercel.app`)

## 7. 알려진 한계 / 다음 단계

- **README가 최신화되지 않았음** → 이번 세션에서 해결됨(§8)
- **대시보드 방문자 수·전환율이 여전히 목업**: `itineraries`/`reviews` 테이블에서 집계 가능한 "일정 생성 건수·인기 여행지·목적 비중"은 이번 세션에서 실데이터로 전환했지만, 페이지 방문 자체를 추적하는 이벤트 로깅이 없어 "방문자 수"와 "평균 전환율"은 여전히 목업임. 실 지표가 필요하면 Vercel Analytics 연동이나 자체 이벤트 로깅 추가 필요
- **"내가 만든 일정" 목록 페이지 없음**: `itineraries.user_id`를 저장해두고도 사용자가 과거에 만든 일정들을 다시 볼 UI가 없음(개별 결과 URL로만 재조회 가능)
- **AI 생성 비용**: 여행 1건당 AI 호출 1회 + 실제 검색 최대 60회(유튜브/블로그 각 최대 30회) + 좌표 조회(항목 수만큼, 상한 없음)로, 트래픽이 늘면 YouTube 일일 쿼터·AI Gateway 크레딧·지도 API 비용을 모니터링해야 함. 30박(최대 입력값)처럼 극단적으로 긴 여행은 한 번의 요청으로 하루 쿼터를 크게 소모할 수 있음
- **`/plan/example` 캐시**: 1시간 단위로 캐시되어 비로그인 방문자에게는 쿼터 절약이 되지만, 최초 캐시 미스 시 응답이 느릴 수 있음(항목별 실검색+좌표 조회가 늘어나며 관측된 첫 생성 시간이 27초→56초로 증가)
- **후기 스팸 방지 없음**: 현재 후기 작성에 로그인/레이트리밋 제약이 없어 악용 가능성이 있음
- **일정 생성에 레이트리밋 없음**: 로그인 사용자가 연속 생성 시 AI Gateway 크레딧·YouTube 쿼터가 빠르게 소진될 수 있음
- **일정 재생성 없음**: 한 번 생성된 일정은 고정되며, 사용자가 같은 조건으로 재생성하면 새 레코드가 또 생성됨(기존 레코드 삭제/버전관리 없음)
- **테스트 코드 없음**: `npm run lint` 외 자동화된 테스트가 없음
- **에러 모니터링 미설치**: 배포 시 Vercel drain(외부 모니터링 연동) 미구성 경고 확인됨
- **`genericDestination()`의 지역 판정이 항상 "국내"**: `DESTINATIONS`에 없는 낯선 지명을 입력하면(예: 목록에 없는 해외 소도시) 국내로 간주되어 Naver Maps로 시도되므로 좌표를 못 찾을 수 있음
- **지도 좌표 조회 실패 시 조용히 스킵**: 국내/해외 모두 좌표를 못 찾은 항목은 에러 없이 지도에서 빠짐 — 사용자에게는 "이 항목은 왜 지도에 없지?"로 보일 수 있음
- **Maps Platform 키 2개 체계**: Google 쪽은 서버용(Geocoding, 무제한 도메인)과 클라이언트용(Maps JS, 리퍼러 제한) 키가 분리되어 있어야 함 — 리퍼러 제한 키로는 Geocoding 호출 자체가 거부됨

## 8. 변경 이력

### 이번 작업 세션 (3)
1. 일정 항목당 출처(유튜브/블로그)를 1개에서 최대 3개로 확장
2. 일정 결과 화면에 **동선 지도** 추가 (`ItineraryMap`): 국내는 Naver Maps JS SDK, 해외는 Google Maps JavaScript API로 이원화. 생성 시점에 항목별 좌표를 서버에서 미리 조회해 DB에 저장
3. 국내 좌표 조회(NAVER 지역검색)가 "산책"/"투어" 같은 활동 서술어가 붙으면 실패하는 문제를 발견해, 제목 뒷단어부터 줄여가며 재시도하는 로직 추가 (8/8 해결 확인). 해외(Google Geocoding)는 이 문제 없음
4. 장소 리뷰는 Trip.com/Agoda(공식 API 없음), Naver 플레이스 리뷰(공식 API 미확인), Google Places 리뷰($40/1,000건)를 검토했으나 전부 채택하지 않고, 기존 실제 유튜브/블로그 검색을 확장하는 방식으로 대체

### 이번 작업 세션 (2)
1. README.md를 현재 구현 상태(Clerk/Neon/AI Gateway/YouTube·NAVER API HUB 실연동)에 맞게 재작성
2. 대시보드의 "일정 생성 건수", "인기 여행지", "여행 목적 비중"을 `itineraries` 테이블 실집계로 전환 (`getDashboardData`, `src/db/queries.ts`). 표본이 없을 때는 가짜 데이터로 채우지 않고 빈 상태 문구를 보여줌. 방문자 수·전환율은 여전히 목업

### 이번 작업 세션 (1)
1. Neon Postgres 프로비저닝(Vercel Marketplace) 및 Drizzle 스키마 구축
2. 일정 생성 결과를 base64 토큰 대신 DB(`itineraries`)에 영구 저장하는 방식으로 전환
3. 후기(`reviews`)를 목업 배열에서 실사용자 DB 기반 기능으로 전환
4. 여행 일정 생성 로직을 결정론적 랜덤 조합에서 Vercel AI Gateway(`claude-sonnet-5`) 기반 생성으로 교체, 실패 시 기존 로직으로 자동 폴백
5. 일정 항목마다 실제 관련 있는 유튜브 영상/네이버 블로그를 개별 검색해 매칭하도록 구조 변경(기존: 여행 전체 공용 검색 풀에서 순환 배정)
6. 네이버 블로그 검색을 NAVER API HUB 신규 엔드포인트/인증 방식으로 마이그레이션 (기존 `openapi.naver.com` 방식은 더 이상 동작하지 않음)
