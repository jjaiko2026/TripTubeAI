import { getDb } from "@/db";
import { reviews } from "@/db/schema";

const SEED_REVIEWS = [
  {
    author: "김지수",
    destination: "제주도",
    rating: 5,
    title: "검색 시간이 1/10로 줄었어요",
    content:
      "원래는 유튜브 영상 10개는 봐야 겨우 동선이 그려졌는데, TripTube AI가 짜준 일정에 참고 영상까지 붙어있어서 바로 예약까지 끝냈어요. 실제로 가보니 동선도 딱 맞았습니다.",
    tripMonth: 5,
    nights: 3,
  },
  {
    author: "박현우",
    destination: "도쿄",
    rating: 4,
    title: "출처가 같이 나오니까 신뢰가 가요",
    content:
      "AI가 짜준 일정이라 반신반의했는데, 각 코스마다 참고한 영상/블로그 링크가 붙어있어서 직접 확인하고 갈 수 있었어요. 오사카 갈 때도 또 쓸 것 같습니다.",
    tripMonth: 3,
    nights: 4,
  },
  {
    author: "이서연",
    destination: "부산",
    rating: 5,
    title: "친구들이랑 계획 짤 때 최고",
    content:
      "친구 4명이서 단톡방에서 각자 다른 영상 보내주다가 정리가 안 됐었는데, 한 번에 조건 입력하니까 깔끔하게 일정표가 나와서 그대로 따라갔어요.",
    tripMonth: 7,
    nights: 2,
  },
  {
    author: "최민준",
    destination: "강릉",
    rating: 4,
    title: "혼자 여행 계획 짜기 편했어요",
    content:
      "혼자 여행은 정보 찾기가 더 귀찮았는데 목적을 '힐링'으로 설정하니까 딱 원하는 스타일로 나왔습니다. 예산 예측도 실제랑 크게 다르지 않았어요.",
    tripMonth: 9,
    nights: 2,
  },
  {
    author: "정다은",
    destination: "다낭",
    rating: 5,
    title: "해외여행도 든든하게 준비했어요",
    content:
      "말도 잘 안 통하는 곳이라 걱정했는데, 맛집이랑 액티비티 위주로 짜달라고 하니까 알아서 동선까지 짜줘서 시간 낭비 없이 다녀왔습니다.",
    tripMonth: 1,
    nights: 4,
  },
  {
    author: "한소영",
    destination: "경주",
    rating: 4,
    title: "가족여행 계획이 훨씬 수월해졌어요",
    content:
      "부모님 모시고 가는 여행이라 신경 쓸 게 많았는데, 문화·역사 위주로 요청하니 무리 없는 동선으로 짜줘서 편하게 다녀왔습니다.",
    tripMonth: 10,
    nights: 2,
  },
];

async function main() {
  const db = getDb();
  await db.insert(reviews).values(SEED_REVIEWS.map((r) => ({ ...r, userId: null })));
  console.log(`Seeded ${SEED_REVIEWS.length} reviews.`);
}

main().then(() => process.exit(0));
