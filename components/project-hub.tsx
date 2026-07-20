"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FolderLock,
  LockKeyhole,
  Plus,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { SignOutButton } from "@/components/auth-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Project } from "@/lib/types";

type DialogMode = "create" | "unlock";

export function ProjectHub({
  initialProjects,
  userEmail,
}: {
  initialProjects: Project[];
  userEmail: string;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("unlock");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setPassword("");
    setError(null);
    setLoading(false);
  }

  function openCreate() {
    resetForm();
    setSelectedProject(null);
    setMode("create");
    setOpen(true);
  }

  function openUnlock(project: Project) {
    resetForm();
    setSelectedProject(project);
    setMode("unlock");
    setOpen(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || password.length < 4) return;
    if (mode === "create" && !name.trim()) return;
    if (mode === "unlock" && !selectedProject) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "create"
            ? { action: "create", name: name.trim(), password }
            : {
                action: "unlock",
                projectId: selectedProject?.id,
                password,
              },
        ),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data?.detail
          ? `${data.error ?? "요청에 실패했습니다."} · ${data.detail}`
          : data?.error ?? "요청에 실패했습니다.";
        throw new Error(message);
      }

      const project =
        mode === "create" ? (data.project as Project) : selectedProject;
      if (!project) throw new Error("프로젝트를 확인하지 못했습니다.");
      if (mode === "create") {
        setProjects((current) =>
          current.some((item) => item.id === project.id)
            ? current
            : [...current, project],
        );
      }
      setOpen(false);
      router.push(`/projects/${project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-full flex-1 bg-[radial-gradient(circle_at_80%_0%,oklch(0.95_0.04_160),transparent_32%)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-12 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <UsersRound className="size-4" />
            </span>
            Synthesis
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {userEmail}
            </span>
            <SignOutButton />
          </div>
        </div>

        <section className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Live problem rooms
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
              어느 팀의 문제를
              <br />본질까지 파고들까요?
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              팀마다 독립된 대면 세션에서 생각을 먼저 적고, 데이터로 검증하며, 모두의 직감 선택을 하나의 문제정의로 남깁니다.
            </p>
          </div>
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="size-4" />
            프로젝트 만들기
          </Button>
        </section>

        {projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center py-14 text-center">
              <FolderLock className="size-8 text-muted-foreground" />
              <h2 className="mt-4 font-semibold">아직 프로젝트가 없습니다</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                첫 팀 프로젝트를 만들고 논의를 시작해 보세요.
              </p>
              <Button onClick={openCreate} variant="outline" className="mt-5">
                <Plus className="size-4" /> 프로젝트 만들기
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, index) => (
              <Card
                key={project.id}
                className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md"
              >
                <CardHeader>
                  <div className="mb-5 flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
                      <FolderLock className="size-5" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{project.name}</CardTitle>
                  <CardDescription>
                    비밀번호로 보호된 문제정의 세션
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full justify-between group-hover:border-emerald-500/50"
                    onClick={() => openUnlock(project)}
                  >
                    비밀번호로 입장
                    <ArrowRight className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-700" />
          세션 사이의 생각·데이터·본질 판단은 서로 섞이지 않습니다.
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockKeyhole className="size-5 text-emerald-600" />
              {mode === "create" ? "새 프로젝트 만들기" : selectedProject?.name}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "프로젝트 이름과 입장할 때 사용할 비밀번호를 설정하세요."
                : "프로젝트 비밀번호를 입력하면 팀 논의 공간으로 이동합니다."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            {mode === "create" && (
              <label className="block space-y-2 text-sm font-medium">
                <span>프로젝트 이름</span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value.slice(0, 80))}
                  placeholder="예: 신규 사업 TF"
                  autoFocus
                  autoComplete="off"
                />
              </label>
            )}
            <label className="block space-y-2 text-sm font-medium">
              <span>비밀번호</span>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value.slice(0, 72))}
                placeholder="4자 이상"
                autoFocus={mode === "unlock"}
                autoComplete={mode === "create" ? "new-password" : "current-password"}
              />
            </label>
            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={
                loading ||
                password.length < 4 ||
                (mode === "create" && !name.trim())
              }
            >
              {loading
                ? mode === "create"
                  ? "만드는 중…"
                  : "확인하는 중…"
                : mode === "create"
                  ? "프로젝트 만들고 입장"
                  : "프로젝트 입장"}
              {!loading && <ArrowRight className="size-4" />}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
