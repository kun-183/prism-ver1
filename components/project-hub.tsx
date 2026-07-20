"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Folder,
  LockKeyhole,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { SignOutButton } from "@/components/auth-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Project } from "@/lib/types";

type DialogMode = "create" | "unlock" | "rename" | "delete";

const koreanDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function projectDate(iso: string) {
  return koreanDateFormatter.format(new Date(iso));
}

export function ProjectHub({
  initialProjects,
  userEmail,
  canManageProjects,
}: {
  initialProjects: Project[];
  userEmail: string;
  canManageProjects: boolean;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("unlock");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setPassword("");
    setConfirmation("");
    setError(null);
    setLoading(false);
  }

  function showDialog(nextMode: DialogMode, project: Project | null = null) {
    resetForm();
    setMode(nextMode);
    setSelectedProject(project);
    if (nextMode === "rename" && project) setName(project.name);
    setOpen(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if ((mode === "create" || mode === "rename") && !name.trim()) return;
    if ((mode === "create" || mode === "unlock") && password.length < 4) return;
    if ((mode === "unlock" || mode === "rename" || mode === "delete") && !selectedProject) return;
    if (mode === "delete" && confirmation !== selectedProject?.name) return;

    setLoading(true);
    setError(null);
    try {
      const payload = mode === "create"
        ? { action: "create", name: name.trim(), password }
        : mode === "unlock"
          ? { action: "unlock", projectId: selectedProject!.id, password }
          : mode === "rename"
            ? { action: "rename", projectId: selectedProject!.id, name: name.trim() }
            : { action: "delete", projectId: selectedProject!.id };
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail ? `${data.error} · ${data.detail}` : data?.error ?? "요청에 실패했습니다.");
      }

      if (mode === "create") {
        const project = data.project as Project;
        setProjects((current) => [...current, project]);
        setOpen(false);
        router.push(`/projects/${project.id}`);
        return;
      }
      if (mode === "unlock") {
        setOpen(false);
        router.push(`/projects/${selectedProject!.id}`);
        return;
      }
      if (mode === "rename") {
        const renamed = data.project as Project;
        setProjects((current) => current.map((project) => project.id === renamed.id ? renamed : project));
        setOpen(false);
        router.refresh();
        return;
      }

      setProjects((current) => current.filter((project) => project.id !== selectedProject!.id));
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  const submitDisabled = loading ||
    ((mode === "create" || mode === "unlock") && password.length < 4) ||
    ((mode === "create" || mode === "rename") && !name.trim()) ||
    (mode === "delete" && confirmation !== selectedProject?.name);

  return (
    <main className="relative min-h-full flex-1 overflow-hidden bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_20%_0%,rgba(120,180,255,.24),transparent_38%),radial-gradient(circle_at_85%_10%,rgba(199,168,255,.18),transparent_35%)]" />
      <div className="relative mx-auto w-full max-w-6xl px-5 pb-16 pt-5 sm:px-8 sm:pt-7">
        <header className="flex items-center justify-between rounded-full border border-white/80 bg-white/70 px-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,.06)] backdrop-blur-2xl sm:px-5">
          <div className="flex items-center gap-2.5 font-semibold tracking-[-0.02em]">
            <span className="flex size-8 items-center justify-center rounded-full bg-[#1d1d1f] text-white"><Sparkles className="size-4" /></span>
            Synthesis
          </div>
          <div className="flex items-center gap-2">
            {canManageProjects && <span className="hidden items-center gap-1 rounded-full bg-[#e8f2ff] px-2.5 py-1 text-[11px] font-semibold text-[#0066cc] sm:flex"><Check className="size-3" /> 관리자</span>}
            <span className="hidden max-w-52 truncate text-xs text-[#6e6e73] md:inline">{userEmail}</span>
            <SignOutButton />
          </div>
        </header>

        <section className="pb-12 pt-16 text-center sm:pb-16 sm:pt-24">
          <p className="text-sm font-semibold text-[#0071e3]">Problem Definition Workspace</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            팀의 생각이 모여,<br />하나의 본질이 됩니다.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-7 text-[#6e6e73] sm:text-lg">
            프로젝트마다 독립된 공간에서 생각을 펼치고, 근거를 검증하고, Synthesis를 거쳐 명확한 문제정의를 완성하세요.
          </p>
          <Button onClick={() => showDialog("create")} size="lg" className="mt-8 h-11 rounded-full bg-[#0071e3] px-5 text-white hover:bg-[#0077ed]">
            <Plus className="size-4" /> 새 프로젝트
          </Button>
        </section>

        {projects.length === 0 ? (
          <section className="rounded-[28px] border border-white bg-white/75 px-6 py-16 text-center shadow-[0_20px_60px_rgba(0,0,0,.07)] backdrop-blur-xl">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f2f2f7] text-[#6e6e73]"><Folder className="size-7" /></span>
            <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">아직 프로젝트가 없습니다</h2>
            <p className="mt-2 text-sm text-[#6e6e73]">첫 프로젝트를 만들고 팀의 문제를 본질까지 탐색해 보세요.</p>
            <Button onClick={() => showDialog("create")} variant="outline" className="mt-6 rounded-full"><Plus className="size-4" /> 프로젝트 만들기</Button>
          </section>
        ) : (
          <section aria-label="프로젝트 목록" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, index) => (
              <article key={project.id} className="group min-w-0 rounded-[28px] border border-white bg-white/82 p-5 shadow-[0_18px_50px_rgba(0,0,0,.07)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(0,0,0,.11)]">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-12 items-center justify-center rounded-[16px] bg-[linear-gradient(145deg,#58a8ff,#0071e3)] text-white shadow-[0_8px_20px_rgba(0,113,227,.25)]"><Folder className="size-6" /></span>
                  <div className="flex items-center gap-1">
                    <span className="mr-1 font-mono text-[11px] text-[#86868b]">{String(index + 1).padStart(2, "0")}</span>
                    {canManageProjects && <>
                      <button type="button" onClick={() => showDialog("rename", project)} aria-label={`${project.name} 이름 변경`} className="flex size-8 items-center justify-center rounded-full text-[#6e6e73] transition hover:bg-[#f2f2f7] hover:text-[#1d1d1f]"><Pencil className="size-3.5" /></button>
                      <button type="button" onClick={() => showDialog("delete", project)} aria-label={`${project.name} 삭제`} className="flex size-8 items-center justify-center rounded-full text-[#6e6e73] transition hover:bg-red-50 hover:text-red-600"><Trash2 className="size-3.5" /></button>
                    </>}
                  </div>
                </div>
                <h2 className="mt-7 min-w-0 break-words text-xl font-semibold tracking-[-0.025em]">{project.name}</h2>
                <p className="mt-1.5 text-xs text-[#86868b]">{projectDate(project.created_at)} 생성 · 비밀번호 보호</p>
                <Button variant="secondary" className="mt-6 h-10 w-full justify-between rounded-full bg-[#f2f2f7] px-4 hover:bg-[#e8e8ed]" onClick={() => showDialog("unlock", project)}>
                  프로젝트 열기 <ArrowRight className="size-4" />
                </Button>
              </article>
            ))}
          </section>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#86868b]">
          <ShieldCheck className="size-4 text-[#0071e3]" /> 프로젝트의 생각과 근거는 서로 분리되어 보호됩니다.
        </div>
      </div>

      <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) resetForm(); }}>
        <DialogContent className="rounded-[26px] border border-white/80 bg-white/92 p-6 shadow-[0_30px_90px_rgba(0,0,0,.22)] backdrop-blur-2xl sm:max-w-md">
          <DialogHeader>
            <span className={`mb-2 flex size-11 items-center justify-center rounded-2xl ${mode === "delete" ? "bg-red-50 text-red-600" : "bg-[#e8f2ff] text-[#0071e3]"}`}>
              {mode === "create" ? <Plus className="size-5" /> : mode === "rename" ? <Pencil className="size-5" /> : mode === "delete" ? <Trash2 className="size-5" /> : <LockKeyhole className="size-5" />}
            </span>
            <DialogTitle className="text-xl font-semibold tracking-[-0.025em]">
              {mode === "create" ? "새 프로젝트" : mode === "rename" ? "프로젝트 이름 변경" : mode === "delete" ? "프로젝트 삭제" : selectedProject?.name}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {mode === "create" && "이름과 입장 비밀번호를 설정하세요."}
              {mode === "unlock" && "프로젝트 비밀번호를 입력해 팀 공간으로 이동하세요."}
              {mode === "rename" && "변경된 이름은 모든 참여자에게 바로 표시됩니다."}
              {mode === "delete" && "프로젝트의 생각, 근거, 최종 보고서가 모두 삭제되며 되돌릴 수 없습니다."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            {(mode === "create" || mode === "rename") && <label className="block space-y-2 text-sm font-medium">
              <span>프로젝트 이름</span>
              <Input value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} placeholder="예: 신규 사업 TF" autoFocus autoComplete="off" className="h-11 rounded-xl bg-[#f5f5f7]" />
            </label>}
            {(mode === "create" || mode === "unlock") && <label className="block space-y-2 text-sm font-medium">
              <span>비밀번호</span>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value.slice(0, 72))} placeholder="4자 이상" autoFocus={mode === "unlock"} autoComplete={mode === "create" ? "new-password" : "current-password"} className="h-11 rounded-xl bg-[#f5f5f7]" />
            </label>}
            {mode === "delete" && <label className="block space-y-2 text-sm font-medium">
              <span>확인을 위해 <strong>{selectedProject?.name}</strong> 입력</span>
              <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={selectedProject?.name} autoFocus autoComplete="off" className="h-11 rounded-xl bg-[#f5f5f7]" />
            </label>}
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-5 text-red-700">{error}</p>}
            <Button type="submit" variant={mode === "delete" ? "destructive" : "default"} className={`h-11 w-full rounded-full ${mode === "delete" ? "" : "bg-[#0071e3] text-white hover:bg-[#0077ed]"}`} disabled={submitDisabled}>
              {loading ? "처리 중…" : mode === "create" ? "프로젝트 만들고 입장" : mode === "unlock" ? "프로젝트 입장" : mode === "rename" ? "이름 변경" : "프로젝트 영구 삭제"}
              {!loading && mode !== "delete" && <ArrowRight className="size-4" />}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
