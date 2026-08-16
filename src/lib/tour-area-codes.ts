/**
 * 한국관광공사 TourAPI(KorService2) areaCode2 값 매핑. destinations.ts의 국내 목적지
 * id에 맞춘 최소 매핑으로, 새 국내 목적지를 추가할 때 여기에도 추가해야 TourAPI 힌트가
 * 붙습니다(없으면 조용히 건너뛰고 기존 activityCatalog만 씁니다).
 */
export const DESTINATION_AREA_CODE: Record<string, string> = {
  jeju: "39", // 제주도
  busan: "6", // 부산
  gangneung: "32", // 강원(강릉은 시군구 세분화 없이 도 단위로 근사)
  yeosu: "38", // 전남(여수는 시군구 세분화 없이 도 단위로 근사)
  gyeongju: "35", // 경북(경주는 시군구 세분화 없이 도 단위로 근사)
};
