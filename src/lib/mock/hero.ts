export interface HeroDestinationVideo {
  id: string;
  name: string;
  emoji: string;
  youtubeId: string;
  title: string;
  channel: string;
}

// 실제 공식 관광 홍보 영상으로 연결됩니다 (임베드 허용된 공식 채널 게시 영상).
const HERO_CANDIDATES: HeroDestinationVideo[] = [
  {
    id: "jeju",
    name: "제주도",
    emoji: "🌊",
    youtubeId: "bXL1F-sMTik",
    title: "Unforgettable Jeju",
    channel: "Jeju Tourism Organization",
  },
  {
    id: "busan",
    name: "부산",
    emoji: "🌉",
    youtubeId: "xLD8oWRmlAE",
    title: "Feel the Rhythm of Korea: BUSAN",
    channel: "Korea Tourism Organization",
  },
];

/**
 * 접속 시점(날짜) 기준으로 "가장 핫한 여행지" 배경 영상을 고릅니다.
 * 실제 서비스에서는 대시보드의 실시간 인기 순위를 그대로 사용하면 됩니다.
 * 데모에서는 제주도(인기 1위) 비중을 높게 두고 날짜에 따라 로테이션합니다.
 */
export function getHotDestinationVideo(date: Date = new Date()): HeroDestinationVideo {
  const startOfYear = new Date(date.getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000);
  const cyclePosition = dayOfYear % 7;
  return cyclePosition < 5 ? HERO_CANDIDATES[0] : HERO_CANDIDATES[1];
}
