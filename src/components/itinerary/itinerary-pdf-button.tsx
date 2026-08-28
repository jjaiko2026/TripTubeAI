"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 10;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_MM * 2;
const SECTION_GAP_MM = 4;

// 실제 화면 폭(특히 모바일)과 무관하게 항상 sm: 브레이크포인트가 적용된 넓은 레이아웃으로
// 캡처해서, PDF가 어느 기기에서 뽑든 동일하게 반응형 레이아웃(요약 카드 4열 등)으로 나오게 합니다.
const CAPTURE_WINDOW_WIDTH_PX = 820;

/** 캡처한 이미지를 한 페이지 안에 맞춥니다. 폭은 항상 페이지 폭에 맞추고, 내용이 길어 한
 *  페이지 높이를 넘으면 비율을 유지한 채 전체를 축소해서 페이지 안에 통째로 담습니다(중간이
 *  잘리는 대신 글씨가 작아짐). 축소된 경우 남는 폭만큼 가운데 정렬합니다. */
function drawFittedToPage(pdf: import("jspdf").jsPDF, canvas: HTMLCanvasElement) {
  let widthMm = CONTENT_WIDTH_MM;
  let heightMm = (canvas.height * CONTENT_WIDTH_MM) / canvas.width;

  if (heightMm > CONTENT_HEIGHT_MM) {
    const scale = CONTENT_HEIGHT_MM / heightMm;
    heightMm = CONTENT_HEIGHT_MM;
    widthMm = CONTENT_WIDTH_MM * scale;
  }

  const x = MARGIN_MM + (CONTENT_WIDTH_MM - widthMm) / 2;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, MARGIN_MM, widthMm, heightMm);
}

/** PDF 1페이지 맨 위에만 들어가는 제목. 일정 화면(일정 만들기 결과 페이지)에는 노출하지
 *  않으므로 화면 DOM에 넣지 않고, 캡처 직전에만 화면 밖(위쪽 멀리)에 임시로 렌더링해
 *  html2canvas로 찍은 뒤 바로 제거합니다. */
function createOffscreenTitleElement(titleText: string): HTMLElement {
  const el = document.createElement("h2");
  el.textContent = titleText;
  el.setAttribute("aria-hidden", "true");
  el.style.position = "fixed";
  el.style.top = "-10000px";
  el.style.left = "0";
  el.style.width = `${CAPTURE_WINDOW_WIDTH_PX}px`;
  el.className = "text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl";
  return el;
}

/** 서로 떨어져 있는 여러 블록(예: 요약 카드 + 알아두면 좋은 정보 + 일자별 순서도)을 각각
 *  따로 캡처한 뒤 세로로 이어 붙여, 한 페이지에 함께 들어갈 하나의 이미지로 합칩니다. */
async function captureStacked(
  html2canvas: typeof import("html2canvas-pro").default,
  elements: HTMLElement[]
): Promise<HTMLCanvasElement> {
  const canvases = await Promise.all(
    elements.map((el) =>
      html2canvas(el, { scale: 2, backgroundColor: "#ffffff", windowWidth: CAPTURE_WINDOW_WIDTH_PX })
    )
  );
  if (canvases.length === 1) return canvases[0];

  const gapPx = Math.round(SECTION_GAP_MM * (canvases[0].width / CONTENT_WIDTH_MM));
  const width = Math.max(...canvases.map((c) => c.width));
  const height = canvases.reduce((sum, c) => sum + c.height, 0) + gapPx * (canvases.length - 1);

  const composite = document.createElement("canvas");
  composite.width = width;
  composite.height = height;
  const ctx = composite.getContext("2d");
  if (!ctx) return canvases[0];
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  let y = 0;
  for (const c of canvases) {
    // 캡처된 블록마다 실제 폭이 다를 수 있어(제목은 강제 폭 820px, 카드들은 페이지 컨테이너
    // 폭), 항상 왼쪽으로 그리면 폭이 좁은 블록이 전체적으로 왼쪽에 쏠려 보입니다. 합성 캔버스
    // 폭 기준으로 가운데 정렬해서 그립니다.
    const x = (width - c.width) / 2;
    ctx.drawImage(c, x, y);
    y += c.height + gapPx;
  }
  return composite;
}

async function generatePdfBlob(targetId: string, titleText: string): Promise<Blob | null> {
  const container = document.getElementById(targetId);
  if (!container) return null;

  // 1페이지: 제목 + 여행지 정보 + 알아두면 좋은 정보 + 일자별 순서도(모두
  // data-pdf-page="summary", 제목은 화면 밖 임시 요소). 2페이지부터: 하루 일정당 한 페이지.
  // 지도 카드처럼 위 셀렉터에 해당하지 않는 블록은 PDF에서 자연히 빠집니다.
  const summaryEls = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-page="summary"]'));
  const dayEls = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-day]"));
  const trailingEls = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-section]"));

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  // 일차 카드가 접혀 있어도(itinerary-days-list.tsx의 <details>) PDF에는 전체가 나와야 한다.
  // .pdf-capturing 클래스가 붙는 동안 CSS가 접힌 내용을 강제로 펼친다(globals.css). React
  // 상태를 건드리지 않아 화면 깜빡임이 없다.
  container.classList.add("pdf-capturing");

  const titleEl = createOffscreenTitleElement(titleText);
  document.body.appendChild(titleEl);

  try {
    const pageGroups: HTMLElement[][] = [
      [titleEl, ...summaryEls],
      ...dayEls.map((el) => [el]),
      ...trailingEls.map((el) => [el]),
    ];
    if (pageGroups.length === 0) return null;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    for (let i = 0; i < pageGroups.length; i++) {
      const canvas = await captureStacked(html2canvas, pageGroups[i]);
      if (i > 0) pdf.addPage();
      drawFittedToPage(pdf, canvas);
    }

    return pdf.output("blob");
  } finally {
    titleEl.remove();
    container.classList.remove("pdf-capturing");
  }
}

export function ItineraryPdfButton({
  targetId,
  fileName,
  title,
}: {
  targetId: string;
  fileName: string;
  title: string;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // 언마운트 시에도 마지막으로 만든 미리보기 URL을 정리합니다.
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  async function handlePreview() {
    setIsGenerating(true);
    setError(false);
    try {
      const blob = await generatePdfBlob(targetId, title);
      if (!blob) {
        setError(true);
        return;
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError(true);
    } finally {
      setIsGenerating(false);
    }
  }

  function closePreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    setPreviewUrl(null);
  }

  function handleDownload() {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = fileName;
    a.click();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-destructive">PDF 생성에 실패했어요</span>}
        <Button variant="outline" size="sm" onClick={handlePreview} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          {isGenerating ? "PDF 생성 중..." : "PDF 미리보기"}
        </Button>
      </div>

      <Dialog open={previewUrl !== null} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>PDF 미리보기</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe src={previewUrl} title="일정 PDF 미리보기" className="h-[70vh] w-full rounded-md border" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closePreview}>
              닫기
            </Button>
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4" /> 다운로드
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
