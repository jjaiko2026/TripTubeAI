import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function PlanIndexPage() {
  const session = await getSession();
  redirect(session ? "/plan/new" : "/plan/example");
}
