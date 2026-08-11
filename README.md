# TripTube AI

Trip + YouTube + AI — 여행지·인원·기간·시기·목적만 입력(또는 챗봇과 대화)하면 최근 1년간의 유튜브 영상과 블로그 글을 분석해 여행 일정을 만들어 주는 웹앱입니다.

제품 요구사항은 [PRD.md](PRD.md)(현재 상태) / [docs/PRD.md](docs/PRD.md)(프로젝트 시작 시점 원본)를 참고하세요.

## 시작하기

Clerk / Neon / AI Gateway 환경변수는 모두 Vercel Marketplace로 프로비저닝되어 있어 아래처럼 받아오면 됩니다:

```bash
vercel env pull .env.local --yes   # CLERK_*, DATABASE_URL, YOUTUBE_API_KEY, NAVER_CLIENT_* 등
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

## 현재 구현 범위

- **인증**: Clerk (Vercel Marketplace 연동, `src/proxy.ts`, `@clerk/nextjs`). Google 소셜 로그인은 [Clerk Dashboard](https://dashboard.clerk.com)의 Social Connections에서 활성화해야 합니다.
- **여행 플래너 챗봇**: `/plan/new`에서 폼과 나란히 뜨는 대화형 챗봇 (`src/lib/trip-chat.ts`, `src/components/plan/trip-chat.tsx`, `src/app/api/trip-chat/route.ts`). Vercel AI Gateway 경유 `google/gemini-3.6-flash`를 사용하며, 사용자가 말한 조건을 `updateTripDraft` 툴 호출로 옆 폼에 실시간 반영합니다. 목적지 이름이 여러 지역과 겹칠 수 있으면(예: 광주) 추측하지 않고 되물어서 확정합니다. 폼 생성과 같은 AI Gateway 자격 증명을 쓰므로 별도 API 키가 필요 없습니다.
- **AI 일정 생성**: Vercel AI Gateway 경유 `anthropic/claude-sonnet-5` (`src/lib/itinerary.ts`, `generateText` + `Output.object`). 목적지 대표 활동 후보(`src/lib/mock/destinations.ts`)를 참고해 일자별 일정을 생성하고, 날짜별 담당 소지역(`dayRegions`)을 먼저 정하게 해 이미 지나온 지역을 다른 날짜에 다시 왔다갔다 하지 않도록 동선을 유도합니다. AI 호출이 실패하면 결정론적 템플릿 로직으로 자동 폴백합니다.
- **여행 지역 선택 / 지역명 중복 해소**: 국내·해외는 AI 추측이 아니라 사용자가 폼(또는 챗봇 대화)에서 직접 확정하며, 이 값이 지오코딩·지도 공급자 선택의 유일한 기준입니다(`src/lib/types.ts`의 `TripRequest.region`). "광주"처럼 이름이 여러 지역과 겹치는 목적지는 화살표로 탐색 가능한 선택지를 보여주고 확정 전까지 제출을 막습니다(`src/lib/mock/destinations.ts`의 `AMBIGUOUS_DESTINATIONS`).
- **YouTube 영상 검색 / 네이버 블로그 검색**: 실 API 연동됨 (`src/lib/real/youtube.ts`, `src/lib/real/naver-blog.ts`). 일정 항목마다(제목이 같으면 캐시 재사용) `"{목적지} {항목 제목}"`으로 개별 검색해, 그 활동과 실제로 관련 있는 출처를 붙입니다. 아래 환경변수가 없거나 호출이 실패하면 자동으로 목업 검색 결과로 대체됩니다.

  | 환경변수 | 발급처 |
  |---|---|
  | `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) → YouTube Data API v3 사용 설정 → API 키 |
  | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | [네이버 개발자센터](https://developers.naver.com) → **NAVER API HUB**(`console.ncloud.com/naver-api-hub`) → Application 등록 → 사용 API에 "블로그" 체크 |

  `.env.local`에 추가한 뒤 `npm run dev`를 재시작하면 바로 실 데이터로 전환됩니다. 네이버 블로그 검색은 `naverapihub.apigw.ntruss.com` 엔드포인트에 `X-NCP-APIGW-API-KEY(-ID)` 헤더로 인증합니다 (구 `openapi.naver.com` 방식은 더 이상 사용하지 않음). 여행 1건당 실제 검색은 최대 30개 고유 일정 항목까지 수행합니다(일반적인 3~4박 여행은 전부 실검색, 그 이상 긴 여행만 일부 목업으로 대체되어 하루 쿼터가 한 번에 소진되지 않게 함). `/plan/example`은 1시간 캐시(`unstable_cache`)를 둡니다.
- **DB**: Neon Postgres + Drizzle ORM (`src/db/`). 일정(`itineraries`)과 후기(`reviews`)를 영구 저장합니다.
  - `npm run db:push` — 스키마를 Neon에 반영
  - `npm run db:seed` — 초기 후기 샘플 데이터 시딩
  - `npm run db:studio` — Drizzle Studio 실행
- **최근 일정 관리**: 로그인 사용자가 만든 일정을 `/plan/new` 상단에 카드로 보여주고(`getRecentItinerariesForUser`), 카드별로 삭제할 수 있습니다(`deleteItineraryAction`). 서버에서 본인이 만든 일정인지 소유자(`userId`)를 검증합니다.
- **일정 동선 지도**: 일정 생성 시 항목별 좌표를 조회해 저장하고, 결과 화면에서 국내는 Naver Maps, 해외는 Google Maps로 동선을 보여줍니다 (`src/lib/real/geocode.ts`, `src/components/itinerary/itinerary-map.tsx`). Google Geocoding이 행정구역 단위로만 매칭된 결과(실제 상호명이 아닌 묘사적 제목 등)는 좌표 없음으로 처리해, 서로 다른 장소가 같은 좌표에 겹쳐 찍히는 문제를 방지합니다. 일차 범례를 클릭하면 해당 일차의 마커/동선을 켜고 끌 수 있고, 같은 날 서로 아주 가까운 좌표는 작은 원 위에 펼쳐 배치해 번호가 겹치지 않게 합니다.

  | 환경변수 | 발급처 |
  |---|---|
  | `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | NCP 콘솔 → Services → Application Services → **Maps** → Application 등록 (API로 "Web 동적 지도" 체크) — NAVER API HUB와는 별개 상품 |
  | `GOOGLE_GEOCODING_API_KEY` | Google Cloud Console → Geocoding API 사용 설정 → API 키 (API 제한사항만, 리퍼러 제한 걸면 서버 호출이 막힘) |
  | `NEXT_PUBLIC_GOOGLE_MAPS_CLIENT_KEY` | Google Cloud Console → Maps JavaScript API 사용 설정 → API 키 (애플리케이션 제한사항을 HTTP 리퍼러로, 배포 도메인 등록 필수 — 브라우저에 노출되는 키라서) |

## 주요 페이지

| 경로 | 설명 |
|---|---|
| `/` | 랜딩 페이지 |
| `/sign-in`, `/sign-up` | Clerk 로그인/회원가입 |
| `/plan/new` | 최근 일정 카드 + 챗봇 + 여행 조건 입력 폼 (로그인 필요) |
| `/plan/example` | 비로그인 사용자용 예시 일정 |
| `/plan/result/[id]` | 생성된 일정 결과 (DB에 영구 저장됨) |
| `/dashboard` | 방문자·일정 생성 통계, 여행지별 평균 비용 |
| `/reviews` | 여행 후기 |
| `/api/trip-chat` | 챗봇 스트리밍 API 라우트 (로그인 필요) |

## 알려진 한계 / 다음 단계

자세한 내용은 [PRD.md](PRD.md)의 "11. 리스크 및 오픈 이슈" / "12. 로드맵" 섹션을 참고하세요. 요약:

- 대시보드의 방문자 수·전환율은 아직 목업(실제 이벤트 트래킹 미연동)
- 일정 생성/후기 작성에 레이트리밋 없음
- "내가 만든 일정" 전체 목록 페이지는 없음 (최근 3개까지만 카드로 노출, 그 이전 것은 개별 결과 URL로만 재조회 가능)
- Naver/Google 지도 API 키가 배포 도메인 단위로 제한되어 있어 로컬 개발 환경에서는 지도가 표시되지 않음 (배포 후 확인 필요)
- Clerk 개발 인스턴스의 봇 방지(Cloudflare Turnstile)로 로그인 플로우 자동화 테스트가 제한됨
