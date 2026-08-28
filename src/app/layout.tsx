import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AttributionCapture } from "@/components/analytics/attribution-capture";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://triptube-ai.vercel.app";
const SITE_TITLE = "TripTube AI — 유튜브·블로그를 모아 여행 일정을 짜드려요";
const SITE_DESC =
  "여행지, 인원, 기간, 시기, 목적만 알려주세요. AI가 유튜브 영상과 블로그 글을 찾아 일자별 동선과 출처까지 정리한 여행 일정을 만들어 드립니다.";

// openGraph.images / twitter.images는 지정하지 않는다 — src/app/opengraph-image.png,
// twitter-image.png 파일 컨벤션이 자동으로 채운다(하위 라우트에서 opengraph-image.tsx로 덮어쓸 수 있음).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESC,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SITE_URL,
    siteName: "TripTube AI",
    title: SITE_TITLE,
    description: SITE_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider appearance={{ theme: shadcn }} afterSignOutUrl="/">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <AttributionCapture />
          <Analytics />
        </ClerkProvider>
      </body>
    </html>
  );
}
