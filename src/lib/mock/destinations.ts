import type { Purpose } from "@/lib/types";

export interface ActivityTemplate {
  time: string;
  title: string;
  description: string;
  tags: Purpose[];
}

export interface DestinationProfile {
  id: string;
  name: string;
  aliases: string[];
  region: "국내" | "해외";
  emoji: string;
  avgCostPerPersonPerNight: number; // KRW
  popularity: number; // 0-100
  activities: ActivityTemplate[];
}

export const DESTINATIONS: DestinationProfile[] = [
  {
    id: "jeju",
    name: "제주도",
    aliases: ["제주", "제주도", "jeju"],
    region: "국내",
    emoji: "🌊",
    avgCostPerPersonPerNight: 180000,
    popularity: 96,
    activities: [
      { time: "", title: "협재해수욕장 산책", description: "에메랄드빛 바다를 배경으로 여유로운 아침 산책을 즐길 수 있는 곳", tags: ["힐링"] },
      { time: "", title: "흑돼지 맛집 투어", description: "제주 전통 방식으로 구운 흑돼지 오겹살 맛집에서 점심", tags: ["맛집"] },
      { time: "", title: "성산일출봉 트레킹", description: "유네스코 세계자연유산, 정상에서 일출과 함께 보는 전망", tags: ["액티비티", "힐링"] },
      { time: "", title: "우도 자전거 투어", description: "배를 타고 들어가는 작은 섬, 해안선을 따라 자전거로 한 바퀴", tags: ["액티비티"] },
      { time: "", title: "제주 해녀박물관", description: "제주 해녀 문화와 역사를 배울 수 있는 전시관 관람", tags: ["문화·역사"] },
      { time: "", title: "동문시장 야시장", description: "제주 로컬 먹거리와 기념품을 한 번에 즐기는 야시장 나들이", tags: ["맛집", "쇼핑"] },
      { time: "", title: "카멜리아힐 산책", description: "사계절 꽃이 피는 정원에서 여유로운 힐링 타임", tags: ["힐링"] },
      { time: "", title: "애월 카페거리", description: "바다 전망 감성 카페에서 즐기는 여유로운 오후", tags: ["힐링", "쇼핑"] },
    ],
  },
  {
    id: "busan",
    name: "부산",
    aliases: ["부산", "busan"],
    region: "국내",
    emoji: "🌉",
    avgCostPerPersonPerNight: 150000,
    popularity: 90,
    activities: [
      { time: "", title: "감천문화마을 골목 투어", description: "알록달록한 계단식 마을에서 사진 명소를 따라 걷는 코스", tags: ["문화·역사"] },
      { time: "", title: "자갈치시장 회 정식", description: "싱싱한 제철 해산물을 맛볼 수 있는 부산 대표 수산시장", tags: ["맛집"] },
      { time: "", title: "해운대 해수욕장", description: "부산을 대표하는 해변에서 즐기는 여유로운 시간", tags: ["힐링"] },
      { time: "", title: "광안리 드론쇼 & 야경", description: "광안대교를 배경으로 한 부산 최고의 야경 명소", tags: ["힐링"] },
      { time: "", title: "태종대 유람선", description: "기암절벽 해안선을 유람선으로 둘러보는 액티비티", tags: ["액티비티"] },
      { time: "", title: "서면 쇼핑거리", description: "부산 최대 번화가에서 즐기는 쇼핑과 길거리 음식", tags: ["쇼핑", "맛집"] },
      { time: "", title: "범어사 산책", description: "천년 고찰에서 즐기는 조용한 힐링 산책", tags: ["힐링", "문화·역사"] },
    ],
  },
  {
    id: "gangneung",
    name: "강릉",
    aliases: ["강릉", "gangneung"],
    region: "국내",
    emoji: "☕",
    avgCostPerPersonPerNight: 140000,
    popularity: 80,
    activities: [
      { time: "", title: "안목해변 커피거리", description: "바다를 보며 즐기는 강릉 대표 커피 거리 투어", tags: ["힐링", "맛집"] },
      { time: "", title: "경포호 자전거 라이딩", description: "호수를 따라 도는 상쾌한 자전거 코스", tags: ["액티비티"] },
      { time: "", title: "오죽헌 관람", description: "신사임당과 율곡 이이의 발자취를 따라가는 역사 탐방", tags: ["문화·역사"] },
      { time: "", title: "초당순두부 마을", description: "강릉의 명물, 바닷물로 만든 순두부 정식", tags: ["맛집"] },
      { time: "", title: "정동진 일출", description: "동해 최고의 일출 명소에서 맞이하는 아침", tags: ["힐링"] },
      { time: "", title: "주문진 수산시장", description: "싱싱한 활어회와 건어물을 구경하는 재래시장 투어", tags: ["맛집", "쇼핑"] },
    ],
  },
  {
    id: "yeosu",
    name: "여수",
    aliases: ["여수", "yeosu"],
    region: "국내",
    emoji: "🌆",
    avgCostPerPersonPerNight: 145000,
    popularity: 72,
    activities: [
      { time: "", title: "여수 밤바다 야경 투어", description: "케이블카를 타고 즐기는 낭만적인 여수 밤바다", tags: ["힐링"] },
      { time: "", title: "돌산공원 전망대", description: "여수 시내와 바다를 한눈에 담을 수 있는 전망 명소", tags: ["힐링"] },
      { time: "", title: "게장 골목 맛집 투어", description: "여수 대표 음식, 간장게장 정식을 즐기는 코스", tags: ["맛집"] },
      { time: "", title: "오동도 산책", description: "동백꽃길을 따라 걷는 섬 산책 코스", tags: ["힐링"] },
      { time: "", title: "이순신광장 & 진남관", description: "임진왜란의 역사를 느낄 수 있는 문화유산 탐방", tags: ["문화·역사"] },
    ],
  },
  {
    id: "gyeongju",
    name: "경주",
    aliases: ["경주", "gyeongju"],
    region: "국내",
    emoji: "🏯",
    avgCostPerPersonPerNight: 130000,
    popularity: 68,
    activities: [
      { time: "", title: "불국사 & 석굴암", description: "유네스코 세계문화유산, 신라 천년의 역사를 느끼는 탐방", tags: ["문화·역사"] },
      { time: "", title: "동궁과 월지 야경", description: "신라 왕궁 연못의 아름다운 야경 산책", tags: ["힐링", "문화·역사"] },
      { time: "", title: "황리단길 맛집 & 카페", description: "한옥거리를 따라 즐기는 감성 맛집과 디저트 카페", tags: ["맛집", "쇼핑"] },
      { time: "", title: "대릉원 고분 산책", description: "천마총을 비롯한 신라 왕릉을 걷는 산책 코스", tags: ["문화·역사", "힐링"] },
      { time: "", title: "보문관광단지 자전거", description: "호수를 따라 즐기는 여유로운 자전거 라이딩", tags: ["액티비티"] },
    ],
  },
  {
    id: "tokyo",
    name: "도쿄",
    aliases: ["도쿄", "tokyo", "일본 도쿄"],
    region: "해외",
    emoji: "🗼",
    avgCostPerPersonPerNight: 220000,
    popularity: 92,
    activities: [
      { time: "", title: "츠키지 장외시장 아침식사", description: "신선한 스시와 해산물 덮밥으로 즐기는 도쿄의 아침", tags: ["맛집"] },
      { time: "", title: "센소지 아사쿠사 거리", description: "도쿄에서 가장 오래된 사찰과 전통 거리 탐방", tags: ["문화·역사"] },
      { time: "", title: "시부야 & 하라주쿠 쇼핑", description: "일본 최신 트렌드를 느낄 수 있는 쇼핑 거리", tags: ["쇼핑"] },
      { time: "", title: "팀랩 플래닛 체험", description: "몰입형 디지털 아트를 경험하는 액티비티", tags: ["액티비티"] },
      { time: "", title: "신주쿠 이자카야 골목", description: "현지인처럼 즐기는 좁은 골목 이자카야 투어", tags: ["맛집"] },
      { time: "", title: "우에노 공원 산책", description: "도심 속 여유를 즐길 수 있는 대표 공원", tags: ["힐링"] },
    ],
  },
  {
    id: "osaka",
    name: "오사카",
    aliases: ["오사카", "osaka"],
    region: "해외",
    emoji: "🍢",
    avgCostPerPersonPerNight: 200000,
    popularity: 85,
    activities: [
      { time: "", title: "도톤보리 길거리 음식 투어", description: "타코야키, 오코노미야키 등 오사카 대표 먹거리 탐방", tags: ["맛집"] },
      { time: "", title: "오사카성 관람", description: "일본 3대 성 중 하나, 역사와 전망을 함께 즐기는 코스", tags: ["문화·역사"] },
      { time: "", title: "신사이바시 쇼핑거리", description: "오사카 최대 쇼핑 아케이드에서 즐기는 쇼핑", tags: ["쇼핑"] },
      { time: "", title: "유니버설 스튜디오 재팬", description: "하루 종일 즐기는 테마파크 액티비티", tags: ["액티비티"] },
      { time: "", title: "구로몬 시장 맛집 투어", description: "오사카의 부엌이라 불리는 재래시장 먹거리 탐방", tags: ["맛집", "쇼핑"] },
    ],
  },
  {
    id: "danang",
    name: "다낭",
    aliases: ["다낭", "danang"],
    region: "해외",
    emoji: "🏖️",
    avgCostPerPersonPerNight: 160000,
    popularity: 78,
    activities: [
      { time: "", title: "미케 비치 선셋", description: "다낭 대표 해변에서 즐기는 여유로운 노을 감상", tags: ["힐링"] },
      { time: "", title: "바나힐 & 골든브릿지", description: "구름 위 놀이공원과 손 모양 다리 액티비티", tags: ["액티비티"] },
      { time: "", title: "호이안 등불거리 야경", description: "유네스코 문화유산 고도시의 낭만적인 야경 산책", tags: ["문화·역사", "힐링"] },
      { time: "", title: "분짜 & 반쎄오 맛집 투어", description: "현지인 추천 베트남 로컬 맛집 탐방", tags: ["맛집"] },
      { time: "", title: "한시장 쇼핑", description: "기념품과 특산품을 구매할 수 있는 재래시장", tags: ["쇼핑"] },
    ],
  },
  {
    id: "bangkok",
    name: "방콕",
    aliases: ["방콕", "bangkok"],
    region: "해외",
    emoji: "🛕",
    avgCostPerPersonPerNight: 170000,
    popularity: 74,
    activities: [
      { time: "", title: "왓포 & 왓아룬 사원 투어", description: "황금빛 사원과 새벽사원을 둘러보는 문화 탐방", tags: ["문화·역사"] },
      { time: "", title: "카오산로드 야시장", description: "배낭여행자의 성지, 활기찬 야시장 거리 탐방", tags: ["맛집", "쇼핑"] },
      { time: "", title: "톤부리 수상시장 투어", description: "배를 타고 둘러보는 이색적인 수상시장 체험", tags: ["액티비티"] },
      { time: "", title: "짐톰슨 하우스", description: "태국 전통 건축과 정원을 감상하는 힐링 코스", tags: ["힐링", "문화·역사"] },
      { time: "", title: "룸피니 공원 산책", description: "도심 속 여유를 즐기는 방콕 대표 공원", tags: ["힐링"] },
    ],
  },
  {
    id: "paris",
    name: "파리",
    aliases: ["파리", "paris"],
    region: "해외",
    emoji: "🗼",
    avgCostPerPersonPerNight: 280000,
    popularity: 70,
    activities: [
      { time: "", title: "에펠탑 & 트로카데로 정원", description: "파리의 상징을 가장 아름답게 담을 수 있는 포토스팟", tags: ["힐링"] },
      { time: "", title: "루브르 박물관", description: "세계 3대 박물관에서 만나는 예술과 역사", tags: ["문화·역사"] },
      { time: "", title: "몽마르트 언덕 카페 투어", description: "화가들의 거리에서 즐기는 감성 카페 나들이", tags: ["힐링", "맛집"] },
      { time: "", title: "마레지구 편집숍 쇼핑", description: "파리지앵 스타일을 느낄 수 있는 편집숍 거리", tags: ["쇼핑"] },
      { time: "", title: "센강 유람선 디너 크루즈", description: "야경을 감상하며 즐기는 로맨틱한 저녁 식사", tags: ["맛집", "액티비티"] },
    ],
  },
];

export function findDestination(query: string): DestinationProfile | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;
  return DESTINATIONS.find(
    (d) =>
      d.name.toLowerCase() === normalized ||
      d.aliases.some((a) => a.toLowerCase() === normalized) ||
      d.aliases.some((a) => normalized.includes(a.toLowerCase()))
  );
}

export function genericDestination(name: string): DestinationProfile {
  return {
    id: "generic",
    name,
    aliases: [name],
    // 이 값은 활동 카탈로그 생성용일 뿐, 지오코딩/지도 선택에는 쓰이지 않습니다
    // (사용자가 폼에서 직접 고른 TripRequest.region이 유일한 진실 소스입니다).
    region: "국내",
    emoji: "🧳",
    avgCostPerPersonPerNight: 160000,
    popularity: 40,
    activities: [
      { time: "", title: `${name} 대표 명소 탐방`, description: `${name}에서 가장 사랑받는 랜드마크를 둘러보는 코스`, tags: ["문화·역사"] },
      { time: "", title: `${name} 로컬 맛집 탐방`, description: `현지인들이 즐겨 찾는 ${name}의 맛집 골목`, tags: ["맛집"] },
      { time: "", title: `${name} 자연 산책 코스`, description: `여유롭게 걸으며 힐링할 수 있는 산책로`, tags: ["힐링"] },
      { time: "", title: `${name} 액티비티 체험`, description: `${name}에서만 즐길 수 있는 특별한 체험 프로그램`, tags: ["액티비티"] },
      { time: "", title: `${name} 전통시장 & 쇼핑거리`, description: `기념품과 특산품을 구경하는 쇼핑 코스`, tags: ["쇼핑"] },
    ],
  };
}

export interface AmbiguousDestinationOption {
  label: string;
  value: string;
}

/** 이름만으로는 어느 지역인지 특정할 수 없는 국내 지명. 사용자가 폼/챗봇에서 명확히 고르도록 안내하는 데 씁니다. */
export const AMBIGUOUS_DESTINATIONS: Record<string, AmbiguousDestinationOption[]> = {
  "광주": [
    { label: "광주광역시 (전라도)", value: "광주광역시" },
    { label: "경기 광주시", value: "경기 광주시" },
  ],
  "고성": [
    { label: "강원 고성군", value: "강원 고성군" },
    { label: "경남 고성군", value: "경남 고성군" },
  ],
};

/**
 * 입력된 목적지 텍스트가 애매한 지명(아직 원래 이름 그대로)이거나 이미 그 지명의 특정
 * 후보로 확정된 상태면, 두 경우 모두 같은 그룹을 반환합니다. 확정 후에도 계속 다른
 * 후보로 바꿀 수 있게 하려는 목적입니다.
 */
export function findAmbiguousGroup(
  destinationText: string
): { key: string; options: AmbiguousDestinationOption[] } | undefined {
  const trimmed = destinationText.trim();
  for (const [key, options] of Object.entries(AMBIGUOUS_DESTINATIONS)) {
    if (trimmed === key || options.some((o) => o.value === trimmed)) {
      return { key, options };
    }
  }
  return undefined;
}
