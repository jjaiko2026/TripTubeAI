import type { GeoLocation } from "@/lib/types";

export interface Stop {
  day: number;
  indexInDay: number;
  title: string;
  location: GeoLocation;
}

export interface MapInstance {
  relayout(): void;
  /** 활성화된 일차의 마커/동선만 지도에 남기고, 화면도 그 일차들에 맞춰 다시 맞춥니다. */
  setActiveDays(days: Set<number>): void;
}

export interface MapProvider {
  readonly id: "naver" | "google";
  load(): Promise<void>;
  render(container: HTMLDivElement, stopsByDay: Stop[][]): MapInstance;
}
