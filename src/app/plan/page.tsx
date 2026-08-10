import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default async function PlanIndexPage() {
  const { userId } = await auth();
  redirect(userId ? "/plan/new" : "/plan/example");
}
