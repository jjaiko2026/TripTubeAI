/**
 * place_tourism_details.detail_data(JSONB)는 contentType별로 필드가 완전히 다르다
 * (PHASE3H §11.1 — 관광지 15개/문화시설 13개/음식점 16개 필드, TourAPI 원본 키 이름 그대로
 * 보존). 실제 DB 표본(PHASE 3-L-2 조사, contentTypeId 12/14/39 각 1건)에서 확인된 키 중
 * 사용자에게 의미 있는 항목만 라벨을 붙인다 — 라벨이 없는 나머지 원본 필드는 화면에
 * 표시하지 않는다(추측으로 라벨을 만들지 않는다).
 */
const FIELD_LABELS: Record<string, Record<string, string>> = {
  "12": {
    infocenter: "문의처",
    usetime: "이용시간",
    restdate: "쉬는날",
    parking: "주차",
    chkpet: "반려동물 동반",
    chkbabycarriage: "유모차 대여",
    chkcreditcard: "신용카드",
  },
  "14": {
    infocenterculture: "문의처",
    usetimeculture: "이용시간",
    restdateculture: "쉬는날",
    usefee: "이용요금",
    parkingculture: "주차",
    parkingfee: "주차요금",
    chkcreditcardculture: "신용카드",
  },
  "39": {
    infocenterfood: "문의처",
    opentimefood: "영업시간",
    restdatefood: "쉬는날",
    firstmenu: "대표메뉴",
    treatmenu: "취급메뉴",
    parkingfood: "주차",
    chkcreditcardfood: "신용카드",
  },
};

export interface DetailField {
  key: string;
  label: string;
  value: string;
}

/**
 * TourAPI 원본 필드 값에 종종 "<br>" 개행 태그가 섞여 온다(실측: infocenter
 * "제주시 관광정보센터 064-740-6000<br>\n구좌읍사무소 064-728-1523"). dangerouslySetInnerHTML
 * 없이 안전하게 줄바꿈만 살리기 위해 문자열 치환으로 실제 개행 문자로 바꾼다 — HTML을
 * 렌더링하지 않는다.
 */
function stripBrTags(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}

export function getDetailFields(contentTypeId: string | null, detailData: unknown): DetailField[] {
  if (!contentTypeId || !detailData || typeof detailData !== "object") return [];
  const labels = FIELD_LABELS[contentTypeId];
  if (!labels) return [];

  const data = detailData as Record<string, unknown>;
  const fields: DetailField[] = [];
  for (const [key, label] of Object.entries(labels)) {
    const raw = data[key];
    if (typeof raw !== "string") continue;
    const value = stripBrTags(raw.trim());
    if (value === "") continue;
    fields.push({ key, label, value });
  }
  return fields;
}
