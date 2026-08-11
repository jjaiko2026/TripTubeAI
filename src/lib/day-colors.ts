const DAY_COLORS = [
  "#0d9488", // teal
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#e11d48", // rose
  "#8b5cf6", // violet
  "#0891b2", // cyan
  "#65a30d", // lime
  "#db2777", // pink
];

/** 일정 동선 지도와 일정 목록에서 같은 날짜에 같은 색을 쓰기 위한 공용 팔레트. */
export function colorForDay(day: number): string {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}
