import type { SourceBlog, SourceVideo } from "@/lib/types";
import { mulberry32, hashSeed, seededPick } from "@/lib/mock/rng";

const YOUTUBE_CHANNELS = [
  "여행유튜버 지도",
  "떠나요 트래블",
  "브이로그인생",
  "세계여행중",
  "여행가는날",
  "로컬가이드TV",
  "짐싸는남자",
  "여행에미치다",
];

const YOUTUBE_TITLE_TEMPLATES = [
  (q: string) => `${q} 완전 정복! 실제로 가본 후기`,
  (q: string) => `${q} 브이로그 | 놓치면 후회하는 코스`,
  (q: string) => `${q} 제대로 즐기는 법 (feat. 현지 꿀팁)`,
  (q: string) => `[여행 브이로그] ${q}에서 보낸 3일`,
  (q: string) => `${q} 가기 전 꼭 봐야 할 영상`,
];

const BLOG_SITES = [
  "여행자의 노트",
  "네이버 블로그 - 떠돌이일기",
  "티스토리 - 어디로갈까",
  "브런치 - 여행수집가",
  "여행 매거진 온더로드",
];

const BLOG_TITLE_TEMPLATES = [
  (q: string) => `${q} 여행 코스 총정리 (동선 포함)`,
  (q: string) => `${q} 다녀온 후기 - 예산부터 일정까지`,
  (q: string) => `${q} 여행 전 꼭 알아야 할 팁 10가지`,
  (q: string) => `[내돈내산] ${q} 3박4일 리얼 후기`,
];

const PUBLISHED_LABELS = [
  "2주 전", "1개월 전", "2개월 전", "3개월 전", "4개월 전",
  "5개월 전", "6개월 전", "8개월 전", "10개월 전", "11개월 전",
];

const DURATION_LABELS = ["8:24", "11:37", "6:52", "14:03", "9:18", "17:45", "5:36"];

function seedRngFor(...parts: string[]) {
  return mulberry32(hashSeed(parts.join("|")));
}

export function mockSearchYoutube(query: string, count = 2): SourceVideo[] {
  const rng = seedRngFor("yt", query);
  const results: SourceVideo[] = [];
  for (let i = 0; i < count; i++) {
    const template = seededPick(rng, YOUTUBE_TITLE_TEMPLATES);
    results.push({
      kind: "youtube",
      id: `yt-${hashSeed(query + i)}`,
      title: template(query),
      channelName: seededPick(rng, YOUTUBE_CHANNELS),
      query,
      publishedLabel: seededPick(rng, PUBLISHED_LABELS),
      durationLabel: seededPick(rng, DURATION_LABELS),
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    });
  }
  return results;
}

export function mockSearchBlog(query: string, count = 2): SourceBlog[] {
  const rng = seedRngFor("blog", query);
  const results: SourceBlog[] = [];
  for (let i = 0; i < count; i++) {
    const template = seededPick(rng, BLOG_TITLE_TEMPLATES);
    results.push({
      kind: "blog",
      id: `blog-${hashSeed(query + i)}`,
      title: template(query),
      snippet: `${query}에 대한 실제 방문 후기와 동선, 예산 정보를 정리했어요. 참고하시면 좋을 것 같아요.`,
      siteName: seededPick(rng, BLOG_SITES),
      publishedLabel: seededPick(rng, PUBLISHED_LABELS),
      url: `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`,
    });
  }
  return results;
}

export function pickOneSource(query: string, preferVideo: boolean) {
  return preferVideo ? mockSearchYoutube(query, 1)[0] : mockSearchBlog(query, 1)[0];
}
