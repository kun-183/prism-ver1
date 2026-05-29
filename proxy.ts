import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: 구 middleware는 이제 proxy.ts. 기능은 동일.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 아래를 제외한 모든 경로에서 실행:
     * - _next/static, _next/image (정적 자원)
     * - favicon.ico, 이미지 파일들
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
