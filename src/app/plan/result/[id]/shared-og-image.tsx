import { ImageResponse } from "next/og";
import { getItinerary } from "@/db/queries";
import { monthLabel } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// satori(next/og)는 기본 폰트에 한글 글리프가 없어 별도 폰트 로드가 필요하다. Google Fonts CSS API에
// text= 파라미터로 실제 쓰는 글자만 요청하면(서브셋) 매 요청이 가볍다. 구형 UA로 요청해야 ttf가 온다
// (기본 UA는 woff2를 주는데 satori가 못 읽는다).
async function loadKoreanFont(text: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&text=${encodeURIComponent(text)}`;
  const css = await fetch(cssUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36",
    },
  }).then((res) => res.text());

  const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype|woff)'\)/);
  if (!match) throw new Error("Noto Sans KR font resource not found");
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

export async function renderResultOgImage(id: string) {
  const itinerary = await getItinerary(id);

  const destination = itinerary?.destinationName ?? "TripTube AI";
  const summary = itinerary
    ? `${monthLabel(itinerary.request.month)} · ${itinerary.request.nights}박 ${itinerary.request.nights + 1}일`
    : "AI가 짜는 여행 일정";
  const heading = `${destination} 여행 일정`;

  const fontData = await loadKoreanFont(`${heading}${summary}TripTube AItriptube-ai.vercel.app`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          // 브랜드 바다빛 블루 그라데이션 (globals.css --brand 계열). satori는 hex가 가장 안전.
          background: "linear-gradient(135deg, #1f74c9 0%, #17598f 55%, #113f66 100%)",
          color: "white",
          fontFamily: "Noto Sans KR",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(255,255,255,0.15)",
              fontSize: 28,
            }}
          >
            ✈️
          </div>
          <span style={{ fontSize: 32, fontWeight: 700 }}>TripTube AI</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.25 }}>{heading}</span>
          <span style={{ fontSize: 36, opacity: 0.9 }}>{summary}</span>
        </div>

        <span style={{ fontSize: 28, opacity: 0.85 }}>triptube-ai.vercel.app</span>
      </div>
    ),
    { ...size, fonts: [{ name: "Noto Sans KR", data: fontData, weight: 700, style: "normal" }] }
  );
}
