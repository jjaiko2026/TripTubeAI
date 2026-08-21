"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import { exportContentToSheet, importModerationFromSheet } from "@/lib/sheets/content-sheet";
import { exportKnowledgeToSheet, importKnowledgeStatusFromSheet } from "@/lib/sheets/knowledge-sheet";

// redirect()는 내부적으로 예외를 던져 렌더링을 중단시키는 방식이라, try/catch 안에서
// "성공 시" redirect를 호출하면 그 예외를 catch가 실패로 오인해버립니다. 그래서 실제 작업은
// try 안에서 결과만 받아오고, redirect 호출은 try/catch 바깥에서 성공/실패를 나눠서 합니다.

export async function exportContentSheetAction() {
  const { userId } = await auth();
  if (!isAdminUser(userId)) redirect("/dashboard");

  let count: number;
  try {
    count = await exportContentToSheet();
  } catch (error) {
    console.error("Sheets export failed:", error);
    redirect("/dashboard?sheets=error");
  }
  redirect(`/dashboard?sheets=exported&count=${count}`);
}

export async function importModerationSheetAction() {
  const { userId } = await auth();
  if (!isAdminUser(userId)) redirect("/dashboard");

  let result: { approved: number; rejected: number };
  try {
    result = await importModerationFromSheet();
  } catch (error) {
    console.error("Sheets import failed:", error);
    redirect("/dashboard?sheets=error");
  }
  redirect(`/dashboard?sheets=imported&approved=${result.approved}&rejected=${result.rejected}`);
}

export async function exportKnowledgeSheetAction() {
  const { userId } = await auth();
  if (!isAdminUser(userId)) redirect("/dashboard");

  let count: number;
  try {
    count = await exportKnowledgeToSheet();
  } catch (error) {
    console.error("Knowledge sheet export failed:", error);
    redirect("/dashboard?sheets=error");
  }
  redirect(`/dashboard?sheets=knowledge-exported&count=${count}`);
}

export async function importKnowledgeSheetAction() {
  const { userId } = await auth();
  if (!isAdminUser(userId)) redirect("/dashboard");

  let result: Awaited<ReturnType<typeof importKnowledgeStatusFromSheet>>;
  try {
    // reviewer는 시트 입력이 아니라 이 액션을 실행한(=admin 인증을 통과한) userId를 그대로 쓴다.
    result = await importKnowledgeStatusFromSheet(userId!);
  } catch (error) {
    console.error("Knowledge sheet import failed:", error);
    redirect("/dashboard?sheets=error");
  }
  const issues =
    result.duplicate + result.invalidId + result.notFound + result.invalidValue + result.policyViolation + result.checkViolation;
  redirect(`/dashboard?sheets=knowledge-imported&updated=${result.updated}&skipped=${result.skipped}&issues=${issues}`);
}
