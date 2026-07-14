import { createClient } from "@/lib/supabase/server";
import { TreeView } from "@/components/tree-view";
import { SignInButton, SignOutButton } from "@/components/auth-button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Branch, Comment } from "@/lib/types";

export default async function Home() {
  // 환경변수 미설정 시 친절한 설정 안내(앱 크래시 방지).
  if (!isSupabaseConfigured) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold">⚙️ 설정이 필요합니다</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          <code>.env.local</code> 에 Supabase 값을 채워주세요:
          <br />
          <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          자세한 단계는 <code>README.md</code> 의 설정 체크리스트 참고.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미로그인 → 랜딩
  if (!user) {
    return (
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_20%,oklch(0.93_0.06_160),transparent_35%),radial-gradient(circle_at_15%_80%,oklch(0.95_0.03_250),transparent_30%)]" />
        <div className="w-full max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Discussion catalyst for teams
          </p>
          <h1 className="mt-4 text-balance text-4xl font-bold tracking-[-0.04em] sm:text-6xl">
            더 좋은 결론보다,
            <br />더 멀리 가는 논의.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
            Synthesis는 흩어진 직감을 평균내지 않습니다. 아무도 생각하지 못한 N+1 관점을 던지고, 팀이 다시 말하게 만드는 질문으로 바꿉니다.
          </p>
          <div className="mx-auto mt-8 grid max-w-2xl gap-2 text-left text-sm sm:grid-cols-3">
            {[
              ["01", "관점을 고르고"],
              ["02", "근거를 선별하고"],
              ["03", "논의를 다시 연다"],
            ].map(([number, label]) => (
              <div key={number} className="rounded-xl border bg-background/75 p-3 backdrop-blur">
                <span className="font-mono text-xs text-emerald-700">{number}</span>
                <p className="mt-1 font-medium">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-8">
            <SignInButton />
          </div>
        </div>
      </main>
    );
  }

  // 로그인 → 나무 뷰 데이터 로드
  const { data } = await supabase
    .from("branches")
    .select(
      "id, author_id, idea, created_at, comments(id, branch_id, author_id, body, created_at)",
    )
    .order("created_at");

  const branches: Branch[] = (data ?? []).map(
    (b: Branch & { comments: Comment[] | null }) => ({
      id: b.id,
      author_id: b.author_id,
      idea: b.idea,
      created_at: b.created_at,
      comments: (b.comments ?? []).sort((a, c) =>
        a.created_at.localeCompare(c.created_at),
      ),
    }),
  );

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-end px-4 pt-3">
        <span className="mr-2 text-xs text-muted-foreground">{user.email}</span>
        <SignOutButton />
      </div>
      <TreeView initialBranches={branches} currentUserId={user.id} />
    </main>
  );
}
