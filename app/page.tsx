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
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Synthesis
        </h1>
        <p className="mt-3 max-w-md text-balance text-muted-foreground">
          흩어진 아이디어를 던져두면, 하나를 <em>고르는</em> 게 아니라 누구도
          혼자선 떠올리지 못했을 <strong>N+1번째</strong> 답을 꺼내주는 비대면
          회의 도구.
        </p>
        <div className="mt-8">
          <SignInButton />
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
      <div className="mx-auto flex w-full max-w-2xl items-center justify-end px-4 pt-3">
        <span className="mr-2 text-xs text-muted-foreground">{user.email}</span>
        <SignOutButton />
      </div>
      <TreeView initialBranches={branches} />
    </main>
  );
}
