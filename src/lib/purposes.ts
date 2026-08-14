export type PurposeId =
  | "food"
  | "healing"
  | "nature"
  | "attraction"
  | "cafe"
  | "activity"
  | "culture"
  | "shopping"
  | "festival"
  | "nightlife";

export const ALL_PURPOSE_IDS: PurposeId[] = [
  "food",
  "healing",
  "nature",
  "attraction",
  "cafe",
  "activity",
  "culture",
  "shopping",
  "festival",
  "nightlife",
];

/** 화면에는 항상 이 표시명으로만 노출하고, 저장/AI 프롬프트에는 영문 id를 씁니다. */
export const PURPOSE_LABELS: Record<PurposeId, string> = {
  food: "맛집·미식",
  healing: "휴양·힐링",
  nature: "자연·풍경",
  attraction: "관광·명소",
  cafe: "카페·감성",
  activity: "액티비티·체험",
  culture: "문화·역사",
  shopping: "쇼핑",
  festival: "축제·공연·이벤트",
  nightlife: "야경·나이트라이프",
};

export const PURPOSE_EMOJI: Record<PurposeId, string> = {
  food: "🍜",
  healing: "🏖️",
  nature: "🏞️",
  attraction: "📸",
  cafe: "☕",
  activity: "🎢",
  culture: "🏛️",
  shopping: "🛍️",
  festival: "🎉",
  nightlife: "🌙",
};

export type PurposePriority = "core" | "important" | "normal";

export const PURPOSE_PRIORITY_WEIGHT: Record<PurposePriority, number> = {
  core: 1.0,
  important: 0.7,
  normal: 0.4,
};

export const PURPOSE_PRIORITY_LABELS: Record<PurposePriority, string> = {
  core: "핵심",
  important: "중요",
  normal: "선택",
};

/** 핵심(core)으로 동시에 지정할 수 있는 목적 개수 상한 (PRD §6.3). */
export const MAX_CORE_PURPOSES = 3;

export interface TripPurpose {
  id: PurposeId;
  priority: PurposePriority;
}

export function isPurposeId(value: unknown): value is PurposeId {
  return typeof value === "string" && (ALL_PURPOSE_IDS as string[]).includes(value);
}

function isPurposePriority(value: unknown): value is PurposePriority {
  return value === "core" || value === "important" || value === "normal";
}

/** 구 5종 한글 목적(힐링/맛집/액티비티/문화·역사/쇼핑)을 새 id로 옮기기 위한 매핑. */
const LEGACY_PURPOSE_MAP: Record<string, PurposeId> = {
  힐링: "healing",
  맛집: "food",
  액티비티: "activity",
  "문화·역사": "culture",
  쇼핑: "shopping",
};

/**
 * DB에 남아있는 구버전 데이터(한글 문자열 배열)와 신버전 데이터({id, priority}[])를
 * 모두 안전하게 새 TripPurpose[] 형태로 정규화합니다. 별도 백필 마이그레이션 없이
 * 기존에 저장된 일정도 계속 조회·표시할 수 있게 하기 위한 것입니다.
 */
export function normalizeTripPurposes(raw: unknown): TripPurpose[] {
  if (!Array.isArray(raw)) return [];

  const result: TripPurpose[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const legacyId = LEGACY_PURPOSE_MAP[entry];
      const id = isPurposeId(entry) ? entry : legacyId;
      if (id) result.push({ id, priority: "normal" });
      continue;
    }
    if (entry && typeof entry === "object" && "id" in entry) {
      const id = (entry as { id?: unknown }).id;
      const priority = (entry as { priority?: unknown }).priority;
      if (isPurposeId(id)) {
        result.push({ id, priority: isPurposePriority(priority) ? priority : "normal" });
      }
    }
  }
  return result;
}

/** 항목(장소)별 태그처럼 단일 문자열 하나만 사람이 읽을 라벨로 바꿀 때 씁니다. */
export function purposeLabel(raw: string): string {
  if (isPurposeId(raw)) return PURPOSE_LABELS[raw];
  // 구버전 데이터는 이미 한글 라벨 그 자체이므로 그대로 보여줍니다.
  return raw;
}

const PRIORITY_ORDER: PurposePriority[] = ["normal", "important", "core"];

/**
 * 목적 선택 UI에서 칩을 클릭할 때마다 미선택 → 선택(normal) → important → core → 미선택
 * 순서로 순환시킵니다. core는 MAX_CORE_PURPOSES개까지만 허용하고, 상한에 걸리면 core 단계를
 * 건너뛰고 바로 미선택으로 돌아갑니다.
 */
export function cyclePurposePriority(purposes: TripPurpose[], id: PurposeId): TripPurpose[] {
  const index = purposes.findIndex((p) => p.id === id);
  if (index === -1) {
    return [...purposes, { id, priority: "normal" }];
  }

  const current = purposes[index];
  const nextPriority = PRIORITY_ORDER[PRIORITY_ORDER.indexOf(current.priority) + 1];
  if (!nextPriority) {
    return purposes.filter((p) => p.id !== id);
  }

  const coreCount = purposes.filter((p) => p.priority === "core").length;
  if (nextPriority === "core" && coreCount >= MAX_CORE_PURPOSES) {
    return purposes.filter((p) => p.id !== id);
  }

  return purposes.map((p) => (p.id === id ? { ...p, priority: nextPriority } : p));
}
