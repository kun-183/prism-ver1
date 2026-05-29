import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

/**
 * 서버 컴포넌트 / Route Handler용 Supabase 클라이언트.
 * Next 16에서 cookies()는 async 이므로 await 필요.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 호출되면 set이 막힐 수 있음.
            // proxy(updateSession)가 세션을 갱신하므로 무시해도 안전.
          }
        },
      },
    },
  );
}
