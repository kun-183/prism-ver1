import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

/**
 * 매 요청마다 Supabase 세션 토큰을 갱신한다. proxy.ts(구 middleware)에서 호출.
 *
 * 공식 주의사항:
 *  - createServerClient 와 getUser() 사이에 다른 코드를 넣지 말 것.
 *  - getUser() 호출을 제거하지 말 것(세션 갱신 트리거).
 *  - supabaseResponse 객체를 그대로 반환할 것.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // 환경변수 미설정 시 세션 갱신을 건너뛴다(설정 안내 페이지가 뜨도록).
  if (!isSupabaseConfigured) return supabaseResponse;

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 중요: createServerClient 직후 getUser()를 호출해야 세션이 갱신된다.
  await supabase.auth.getUser();

  return supabaseResponse;
}
