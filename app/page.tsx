import { BrainCircuit, Database, GitBranch, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProjectHub } from "@/components/project-hub";
import { SignInButton } from "@/components/auth-button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isProjectAdminEmail } from "@/lib/project-admin";
import type { Project } from "@/lib/types";

export default async function Home() {
  if (!isSupabaseConfigured) {
    return (
      <main className="flex flex-1 items-center justify-center bg-[#f5f5f7] px-6 py-16 text-center text-[#1d1d1f]">
        <div className="w-full max-w-lg rounded-[28px] border border-white bg-white/85 p-8 shadow-[0_25px_80px_rgba(0,0,0,.09)] backdrop-blur-xl">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#e8f2ff] text-[#0071e3]"><Sparkles className="size-6" /></span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">설정이 필요합니다</h1>
          <p className="mt-3 text-sm leading-6 text-[#6e6e73]"><code>.env.local</code>에 Supabase URL과 anon key를 입력해 주세요. 자세한 내용은 README 설정 체크리스트에서 확인할 수 있습니다.</p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const steps = [
      { icon: GitBranch, title: "표면에서 출발", copy: "팀의 날것 생각을 먼저 안전하게 펼칩니다." },
      { icon: BrainCircuit, title: "왜를 구조화", copy: "MECE와 5 Whys로 통제 가능한 원인까지 내려갑니다." },
      { icon: Database, title: "근거로 검증", copy: "공공데이터와 현장 자료로 발견과 반증을 남깁니다." },
      { icon: Sparkles, title: "Synthesis 후 정의", copy: "N+1 관점을 거쳐 Opus가 최종 보고서를 완성합니다." },
    ];
    return (
      <main className="relative flex flex-1 overflow-hidden bg-[#f5f5f7] text-[#1d1d1f]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[620px] bg-[radial-gradient(circle_at_18%_8%,rgba(88,168,255,.28),transparent_35%),radial-gradient(circle_at_82%_4%,rgba(196,167,255,.24),transparent_34%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-5 sm:px-8">
          <nav className="flex items-center justify-between rounded-full border border-white/80 bg-white/65 px-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,.05)] backdrop-blur-2xl sm:px-5">
            <div className="flex items-center gap-2.5 font-semibold tracking-[-0.02em]"><span className="flex size-8 items-center justify-center rounded-full bg-[#1d1d1f] text-white"><Sparkles className="size-4" /></span>Synthesis</div>
            <span className="text-xs font-medium text-[#86868b]">Human judgment, amplified.</span>
          </nav>

          <section className="mx-auto max-w-5xl pb-20 pt-20 text-center sm:pb-28 sm:pt-32">
            <p className="text-sm font-semibold text-[#0071e3]">Surface to Essence</p>
            <h1 className="mt-5 text-balance text-5xl font-semibold leading-[.98] tracking-[-0.055em] sm:text-7xl lg:text-[88px]">
              회의가 끝나면,<br />문제의 <span className="bg-[linear-gradient(90deg,#0071e3,#7b61ff)] bg-clip-text text-transparent">본질</span>이 남습니다.
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-balance text-lg leading-8 text-[#6e6e73] sm:text-xl">
              사람은 직감하고 판단합니다. AI는 생각을 구조화하고, 근거를 찾고, 더 선명한 문제정의로 기록합니다.
            </p>
            <div className="mt-9 flex justify-center"><SignInButton /></div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, copy }, index) => (
              <article key={title} className="rounded-[26px] border border-white bg-white/72 p-5 shadow-[0_18px_50px_rgba(0,0,0,.06)] backdrop-blur-xl">
                <div className="flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-2xl bg-[#e8f2ff] text-[#0071e3]"><Icon className="size-5" /></span><span className="font-mono text-[11px] text-[#a1a1a6]">0{index + 1}</span></div>
                <h2 className="mt-7 font-semibold tracking-[-0.02em]">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#6e6e73]">{copy}</p>
              </article>
            ))}
          </section>
        </div>
      </main>
    );
  }

  const { data } = await supabase
    .from("projects")
    .select("id, name, created_at")
    .order("created_at");

  return (
    <ProjectHub
      initialProjects={(data ?? []) as Project[]}
      userEmail={user.email ?? "로그인 사용자"}
      canManageProjects={isProjectAdminEmail(user.email)}
    />
  );
}
