import { SignIn } from "@clerk/nextjs";

// 일반 사용자 로그인은 제거됐고, Clerk 로그인은 이제 /admin 접근에만 쓰인다.
export default function Page() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4 py-12">
      <SignIn fallbackRedirectUrl="/admin" />
    </div>
  );
}
