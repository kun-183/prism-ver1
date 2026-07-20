import { createClient } from "@/lib/supabase/server";
import { ProjectHub } from "@/components/project-hub";
import { SignInButton } from "@/components/auth-button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Project } from "@/lib/types";

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
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#f4f1e9] px-5 py-14 text-[#172019]">
        <div className="absolute right-[-10%] top-[-20%] size-[50vw] rounded-full bg-[#d9ff57]/45 blur-3xl" />
        <div className="relative w-full max-w-5xl">
          <div className="mb-8 flex items-center gap-2 border-b border-black/15 pb-4 text-sm font-bold">
            <span className="flex size-7 items-center justify-center bg-[#172019] text-xs text-white">S</span>
            SYNTHESIS
            <span className="ml-auto font-mono text-[10px] font-normal text-black/45">LIVE PROBLEM DEFINITION</span>
          </div>
          <div className="grid gap-10 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#577d11]">
                Surface → Essence
              </p>
              <h1 className="mt-5 text-balance text-5xl font-black leading-[0.94] tracking-[-0.06em] sm:text-7xl lg:text-8xl">
                회의가 끝나면,<br />문제의 <span className="text-[#6f9818]">본질</span>이<br />남아야 합니다.
              </h1>
            </div>
            <div className="border-l-2 border-[#91c423] pl-5">
              <p className="text-lg font-semibold leading-7">표면 생각을 왜?로 파고들고,<br />데이터로 검증하며,<br />팀의 직감으로 본질을 선택합니다.</p>
              <p className="mt-4 text-sm leading-6 text-black/55">직감·판단은 인간이. 리서치·구조화·기록의 노동은 AI가 맡습니다.</p>
              <div className="mt-6"><SignInButton /></div>
            </div>
          </div>
          <div className="mt-12 grid gap-px border border-black/15 bg-black/15 text-left text-sm sm:grid-cols-4">
            {[
              ["01", "표면 문제를 포착하고"],
              ["02", "MECE로 왜를 펼치고"],
              ["03", "가지마다 데이터를 붙이고"],
              ["04", "본질 문제정의로 남긴다"],
            ].map(([number, label]) => (
              <div key={number} className="bg-[#fffdf7] p-4 sm:p-5">
                <span className="font-mono text-xs text-[#577d11]">{number}</span>
                <p className="mt-2 font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // 로그인 → 팀 프로젝트 선택
  const { data } = await supabase
    .from("projects")
    .select("id, name, created_at")
    .order("created_at");

  return (
    <ProjectHub
      initialProjects={(data ?? []) as Project[]}
      userEmail={user.email ?? "로그인 사용자"}
    />
  );
}
