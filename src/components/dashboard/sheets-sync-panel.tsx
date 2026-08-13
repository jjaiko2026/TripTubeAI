"use client";

import { useTransition } from "react";
import { Loader2, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportContentSheetAction, importModerationSheetAction } from "@/lib/sheets/actions";

export function SheetsSyncPanel() {
  const [isExporting, startExport] = useTransition();
  const [isImporting, startImport] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isExporting || isImporting}
        onClick={() => startExport(() => exportContentSheetAction())}
      >
        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        시트로 내보내기
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isExporting || isImporting}
        onClick={() => startImport(() => importModerationSheetAction())}
      >
        {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        시트에서 승인·거부 불러오기
      </Button>
    </div>
  );
}
