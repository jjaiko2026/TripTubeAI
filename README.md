# TripTube AI

Trip + YouTube + AI — 여행지·인원·기간·시기·목적만 입력하면 최근 1년간의 유튜브 영상과 블로그 글을 분석해 여행 일정을 만들어 주는 웹앱입니다.

제품 요구사항은 [docs/PRD.md](docs/PRD.md)를 참고하세요.

## 시작하기

Clerk 환경변수가 필요합니다 (Vercel Marketplace로 프로비저닝됨):

```bash
vercel env pull   # .env.local 에 CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY 등을 받아옵니다
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

## 현재 구현 범위

- **인증**: Clerk (Vercel Marketplace 연동, `src/proxy.ts`, `@clerk/nextjs`). Google 소셜 로그인은 [Clerk Dashboard](https://dashboard.clerk.com)의 Social Connections에서 활성화해야 합니다.
- **YouTube 영상 검색 / 블로그 검색**: 실 API 연동됨 (`src/lib/real/youtube.ts`, `src/lib/real/naver-blog.ts`). 아래 환경변수가 없거나 호출이 실패하면 자동으로 목업 검색 결과로 대체됩니다.

  | 환경변수 | 발급처 |
  |---|---|
  | `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) → YouTube Data API v3 사용 설정 → API 키 |
  | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | [네이버 개발자센터](https://developers.naver.com/apps/#/register) → 검색 API |

  `.env.local`에 추가한 뒤 `npm run dev`를 재시작하면 바로 실 데이터로 전환됩니다. 여행 1건당 유튜브 검색 1회 + 네이버 블로그 검색 1회만 호출하고(각 일정 항목은 그 결과를 순환 배정), `/plan/example`과 `/plan/result/[token]`은 1시간 캐시(`unstable_cache`)를 둬서 `search.list`(유닛당 100)의 일일 쿼터를 아낍니다.
- **AI 일정 생성**: 아직 미연동 — 활동 추천 로직은 `src/lib/mock/destinations.ts`의 큐레이션 데이터 기반입니다.
  - `src/lib/mock/itinerary.ts` — 조건 기반 일정 생성 로직 (소스 풀 구성 포함)
  - `src/lib/mock/reviews.ts`, `src/lib/mock/stats.ts` — 후기·대시보드 목업 데이터
- **DB**: 아직 미연동 — 후기/통계는 메모리·세션 내 목업 데이터입니다.

## 주요 페이지

| 경로 | 설명 |
|---|---|
| `/` | 랜딩 페이지 |
| `/sign-in`, `/sign-up` | Clerk 로그인/회원가입 |
| `/plan/new` | 여행 조건 입력 폼 (로그인 필요) |
| `/plan/example` | 비로그인 사용자용 예시 일정 |
| `/plan/result/[token]` | 생성된 일정 결과 |
| `/dashboard` | 방문자·일정 생성 통계, 여행지별 평균 비용 |
| `/reviews` | 여행 후기 |

## 다음 단계 (실연동)

1. Vercel AI Gateway 등을 통한 실제 AI 요약/일정 구성 로직 연동
2. Postgres(Neon) 등 실 데이터베이스 연동 (일정/후기/통계 영속화)
