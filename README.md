# TripTube AI

**Trip + YouTube + AI** — 사용자가 자연어로 여행 요구를 말하면, AI가 여행지·장소·이동 동선을 해석해 실제 일정으로 만들어 주고, 각 일정지마다 신뢰할 수 있는 참고자료(한국관광공사 · 축적된 여행 지식 · 네이버 블로그 · YouTube)를 붙여 주는 여행 일정 생성 서비스.

🔗 **배포:** https://triptube-ai.vercel.app
📄 **제품 문서:** [PRD.md](PRD.md)

---

## 한눈에 보기

```
"3박4일 도쿄 여행, 가족끼리 힐링하고 맛집 위주로"
        │
        ▼
① 요구 해석 → ② 기존 DB·Knowledge 우선 확보(부족분만 외부 Search)
        → ③ 장소 선정 → ④ 이동 동선 고려한 날짜별 일정 생성
        → ⑤ 일정지마다 참고자료 1~3개 부착 → ⑥ 사용자 편집 · 후기 축적
```

매 요청마다 인터넷을 처음부터 검색하지 않는다. 기존 DB·Knowledge를 우선 활용하고 부족한 정보만 외부에서 보충한다.

## 기술 스택

| 영역 | 사용 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript |
| 스타일 | Tailwind CSS v4 · shadcn 스타일 UI (`@base-ui/react`) · 라이트 전용 |
| 인증 | Clerk (`@clerk/nextjs`) |
| DB | Drizzle ORM + Neon Postgres (serverless) |
| AI | Vercel AI SDK v7 + Google Gemini 직결 (`@ai-sdk/google`, `gemini-3.6-flash`) |
| 차트 | Recharts |
| 외부 데이터 | 한국관광공사 TourAPI · YouTube Data API · 네이버 블로그/지도 · Google Maps/Geocoding · Google Sheets(검수 파이프라인) |
| 배포 | Vercel |

## 로컬 실행

```bash
npm install
cp .env.local.example .env.local   # 아래 환경변수 채우기 (예시 파일이 없으면 직접 생성)
npm run dev                         # http://localhost:3000
```

> Windows에서 `⚠ Slow filesystem detected` 가 뜨면 Windows Defender 실시간 검사 제외 항목에
> 프로젝트 폴더를 추가하면 컴파일/HMR이 크게 빨라진다.

### 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` / `npm start` | 프로덕션 빌드 / 실행 |
| `npm run lint` | ESLint |
| `npm run db:push` | Drizzle 스키마를 DB에 반영 (additive만 — 파괴적 마이그레이션 금지) |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | 후기 시드 데이터 |
| `npm run google:oauth` | Google OAuth refresh token 발급 (검수 시트용) |

## 환경변수

`.env.local` 에 설정한다.

| 변수 | 용도 |
|---|---|
| `DATABASE_URL` | Neon Postgres 연결 문자열 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk 인증 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API (aistudio.google.com 무료 발급) |
| `YOUTUBE_API_KEY` | YouTube Data API |
| `YOUTUBE_DAILY_SEARCH_LIMIT`, `YOUTUBE_COLLECTION_DAILY_LIMIT` | YouTube 호출 상한 (선택) |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 네이버 블로그 검색 |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 네이버 지도 (국내) |
| `NEXT_PUBLIC_GOOGLE_MAPS_CLIENT_KEY` | Google Maps (해외) |
| `GOOGLE_GEOCODING_API_KEY` | 좌표 보정 |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_SHEETS_SPREADSHEET_ID` | 여행 지식 검수 시트 연동 |
| `ADMIN_USER_IDS` | `/admin` 접근 허용 Clerk userId 목록 (콤마 구분) |
| `CRON_SECRET` | `/api/cron/prefetch` 보호 |

키가 없어도 각 호출부에 폴백이 있어 앱은 동작한다(AI 실패 시 결정론적 템플릿, 외부 검색 실패 시 빈 결과 등).

## 주요 라우트

| 경로 | 설명 |
|---|---|
| `/` | 랜딩 |
| `/plan/new` | 일정 만들기 — 폼 + 대화형 챗봇 (Pipeline A, 유일한 사용자 여정) |
| `/plan/result/[id]` | 생성된 일정 — 요약·지도·일자별 카드·참고자료·PDF·공유. 소유자 무관 공개 조회 |
| `/plan/mine` | 내 일정 목록 |
| `/plan/example` | 예시 일정 |
| `/reviews` | 여행 후기 |
| `/dashboard` | 공개 이용 통계 (목 데이터) |
| `/admin` | 관리자 전용 (`ADMIN_USER_IDS`) — 요청 로그, 검수 시트 패널 등 |
| `/api/trip-chat`, `/api/trip-tips`, `/api/nearby-places`, `/api/pdf-download`, `/api/cron/prefetch` | 내부 API |

## 구조

```
src/
  app/            App Router 라우트 + API
  components/     UI 프리미티브(ui/) · 일정(itinerary/) · 폼(plan/) · 후기 · 대시보드
  db/             Drizzle 스키마 + 쿼리 (queries.ts, knowledge-queries.ts, schema.ts)
  lib/
    ai/model.ts   AI 제공자 선택 한 곳 (smartModel / fastModel)
    itinerary.ts  일정 생성 엔진 (Pipeline A)
    geo/, tour-api/, sheets/, knowledge/, real/, mock/
```

## 참고

- 코드 작성 가이드라인은 [CLAUDE.md](CLAUDE.md) 참고 (LLM 코딩 실수 방지 규칙).
- `/places`(장소 둘러보기)와 Pipeline B는 A-BRIDGE 결정(PRD 부록 A) 이후 폐지됐다. "이 지역 더 둘러보기"는 AI 생성(`/api/nearby-places`)으로 대체.
- PDF 다운로드는 PC 전용. 모바일 인앱 브라우저(카카오/네이버)는 다운로드를 완료하지 못해 미리보기 + 안내만 제공한다.
- 다크 모드는 없다(라이트 전용). 필요 시 토글 + 전용 QA로 별도 기능화.
