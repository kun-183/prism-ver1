"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NewBranchForm } from "@/components/new-branch-form";
import { BranchCard } from "@/components/branch-card";
import { SynthesizeButton } from "@/components/synthesize-button";
import { Button } from "@/components/ui/button";
import type { Branch, Comment, Project } from "@/lib/types";

export function TreeView({
  initialBranches,
  currentUserId,
  project,
}: {
  initialBranches: Branch[];
  currentUserId: string;
  project: Project;
}) {
  const [branches, setBranches] = useState<Branch[]>(initialBranches);
  // 회의 시작 시 전체 선택, 이후 개별 제외하는 흐름.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialBranches.map((branch) => branch.id)),
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function upsertBranch(b: Branch) {
    setBranches((prev) =>
      prev.some((x) => x.id === b.id) ? prev : [...prev, b],
    );
  }

  function addComment(c: Comment) {
    setBranches((prev) =>
      prev.map((b) =>
        b.id === c.branch_id
          ? b.comments.some((x) => x.id === c.id)
            ? b
            : { ...b, comments: [...b.comments, c] }
          : b,
      ),
    );
  }

  // 삭제 반영(낙관적 업데이트 + Realtime DELETE 양쪽에서 호출, 멱등).
  function removeBranch(id: string) {
    setBranches((prev) => prev.filter((b) => b.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function removeComment(commentId: string) {
    setBranches((prev) =>
      prev.map((b) =>
        b.comments.some((c) => c.id === commentId)
          ? { ...b, comments: b.comments.filter((c) => c.id !== commentId) }
          : b,
      ),
    );
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("tree-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "branches",
          filter: `project_id=eq.${project.id}`,
        },
        (payload) => {
          const b = payload.new as Omit<Branch, "comments">;
          upsertBranch({ ...b, comments: [] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        (payload) => {
          addComment(payload.new as Comment);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "branches",
          filter: `project_id=eq.${project.id}`,
        },
        (payload) => {
          const old = payload.old as { id?: string };
          if (old.id) removeBranch(old.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "comments" },
        (payload) => {
          const old = payload.old as { id?: string };
          if (old.id) removeComment(old.id);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project.id]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6 overflow-hidden rounded-2xl border bg-[linear-gradient(135deg,var(--card)_55%,oklch(0.96_0.035_160))] p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {project.name}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              결론을 닫지 말고, 다음 각도를 여세요.
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              흩어진 직감에서 아무도 놓지 않았던 N+1 관점을 찾고, 팀이 바로 반응할 수 있는 한 질문으로 논의를 다시 엽니다.
            </p>
          </div>
          <div className="rounded-full border bg-background/80 px-3 py-1.5 font-mono text-xs text-muted-foreground">
            가지 {branches.length} · 선택 {selectedIds.size}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedIds(new Set(branches.map((branch) => branch.id)))}
            disabled={branches.length === 0 || selectedIds.size === branches.length}
          >
            전체 선택
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedIds.size === 0}
          >
            전체 해제
          </Button>
          <SynthesizeButton
            branches={branches}
            selectedIds={Array.from(selectedIds)}
            projectId={project.id}
          />
        </div>
      </header>

      <div className="mb-6">
        <NewBranchForm onCreated={upsertBranch} projectId={project.id} />
      </div>

      {branches.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          아직 가지가 없습니다. 첫 직감을 던져보세요.
        </p>
      ) : (
        <div className="space-y-3">
          {branches.map((b, i) => (
            <BranchCard
              key={b.id}
              branch={b}
              index={i}
              currentUserId={currentUserId}
              selected={selectedIds.has(b.id)}
              onToggleSelect={() => toggleSelect(b.id)}
              onCommentCreated={addComment}
              onBranchDeleted={removeBranch}
              onCommentDeleted={removeComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
