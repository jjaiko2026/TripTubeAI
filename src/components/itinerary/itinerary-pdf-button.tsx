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

/** 한 섹션의 캡처본이 한 페이지보다 길 때, 항목 중간이 아니라 픽셀 단위로 정확히 페이지
 *  경계에서 잘라 다음 페이지로 이어 붙입니다(여백에 걸치거나 내용이 겹치지 않도록). */
function addPagedImage(pdf: import("jspdf").jsPDF, canvas: HTMLCanvasElement) {
  const pxPerMm = canvas.width / CONTENT_WIDTH_MM;
  const pageHeightPx = Math.floor(CONTENT_HEIGHT_MM * pxPerMm);

  let offsetPx = 0;
  let first = true;
  while (offsetPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - offsetPx);
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeightPx;
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(canvas, 0, offsetPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

    if (!first) pdf.addPage();
    pdf.addImage(
      sliceCanvas.toDataURL("image/png"),
      "PNG",
      MARGIN_MM,
      MARGIN_MM,
      CONTENT_WIDTH_MM,
      sliceHeightPx / pxPerMm
    );

    offsetPx += sliceHeightPx;
    first = false;
  }
}

async function generatePdfBlob(targetId: string): Promise<Blob | null> {
  const container = document.getElementById(targetId);
  if (!container) return null;

  // 카드(data-slot="card")와 안내 문구/헤더/일정 항목 같은 블록(data-pdf-section)을 각각 따로
  // 캡처해서, 페이지 경계에 걸치면 그 블록을 자르지 않고 통째로 다음 페이지로 넘깁니다.
  const matches = Array.from(
    container.querySelectorAll<HTMLElement>('[data-slot="card"], [data-pdf-section]')
  ).filter((el) => !el.closest("[data-pdf-exclude]"));

  // 하루 카드처럼 캡처 대상 안에 또 다른 캡처 대상(헤더, 개별 일정 항목)이 들어있으면
  // 바깥 카드는 통째로 캡처하지 않고 안쪽 단위만 사용합니다. 그러지 않으면 일정 항목을 모두
  // 펼쳤을 때 하루 카드 전체가 하나의 큰 이미지가 되어, 항목 중간에서 페이지가 잘립니다.
  const sections = matches.filter((el) => !matches.some((other) => other !== el && el.contains(other)));
  if (sections.length === 0) return null;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let cursorY = MARGIN_MM;
  let pendingNewPage = false;

  for (const section of sections) {
    const canvas = await html2canvas(section, {
      scale: 2,
      backgroundColor: "#ffffff",
      windowWidth: CAPTURE_WINDOW_WIDTH_PX,
    });
    const imgData = canvas.toDataURL("image/png");
    const imgHeightMm = (canvas.height * CONTENT_WIDTH_MM) / canvas.width;

    if (pendingNewPage) {
      pdf.addPage();
      cursorY = MARGIN_MM;
      pendingNewPage = false;
    }

    if (imgHeightMm > CONTENT_HEIGHT_MM) {
      // 항목 하나가 그래도 한 페이지보다 길면(예: 출처가 아주 많은 항목) 그 안에서만 어쩔 수 없이 자릅니다.
      if (cursorY > MARGIN_MM) {
        pdf.addPage();
        cursorY = MARGIN_MM;
      }
      addPagedImage(pdf, canvas);
      pendingNewPage = true;
      continue;
    }

    if (cursorY + imgHeightMm > PAGE_HEIGHT_MM - MARGIN_MM) {
      pdf.addPage();
      cursorY = MARGIN_MM;
    }
    pdf.addImage(imgData, "PNG", MARGIN_MM, cursorY, CONTENT_WIDTH_MM, imgHeightMm);
    cursorY += imgHeightMm + SECTION_GAP_MM;
  }

  return pdf.output("blob");
}

export function ItineraryPdfButton({ targetId, fileName }: { targetId: string; fileName: string }) {
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
      const blob = await generatePdfBlob(targetId);
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
