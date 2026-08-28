"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/** 레이아웃에 한 번 마운트해, 어느 페이지로 처음 들어오든 랜딩 URL의 utm_* 를 쿠키에 담는다. */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
