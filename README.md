# TripTube AI

Trip + YouTube + AI — 여행지·인원·기간·시기·목적만 입력하면 최근 1년간의 유튜브 영상과 블로그 글을 분석해 여행 일정을 만들어 주는 웹앱입니다.

제품 요구사항은 [docs/PRD.md](docs/PRD.md)를 참고하세요.

## 시작하기

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.

## 현재 구현 범위 (Phase 1 — 데모)

실제 YouTube Data API / 블로그 검색 API / AI 모델 / 인증 / DB 없이도 전체 사용자 흐름을 시연할 수 있도록,
`src/lib/mock/` 아래에 목업 데이터 레이어로 구현되어 있습니다.

- `src/lib/mock/destinations.ts` — 여행지별 활동 데이터셋
- `src/lib/mock/sources.ts` — 유튜브/블로그 검색 결과를 흉내 낸 목업 (실제 YouTube/네이버 검색 링크로 연결됨)
- `src/lib/mock/itinerary.ts` — 조건 기반 일정 생성 로직
- `src/lib/mock/reviews.ts`, `src/lib/mock/stats.ts` — 후기·대시보드 목업 데이터
- `src/lib/session.ts`, `src/lib/actions.ts` — 쿠키 기반 데모 로그인 (실서비스 인증 아님)

## 주요 페이지

| 경로 | 설명 |
|---|---|
| `/` | 랜딩 페이지 |
| `/login` | 데모 로그인 |
| `/plan/new` | 여행 조건 입력 폼 (로그인 필요) |
| `/plan/example` | 비로그인 사용자용 예시 일정 |
| `/plan/result/[token]` | 생성된 일정 결과 |
| `/dashboard` | 방문자·일정 생성 통계, 여행지별 평균 비용 |
| `/reviews` | 여행 후기 |

## 다음 단계 (실연동)

1. YouTube Data API v3, 블로그 검색 API(예: 네이버 검색 API) 연동
2. Vercel AI Gateway 등을 통한 실제 AI 요약/일정 구성 로직 연동
3. Clerk 등 실 사용자 인증 및 Postgres(Neon) 등 실 데이터베이스 연동
4. 후기/대시보드 데이터 영속화
