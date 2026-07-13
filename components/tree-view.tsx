"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NewBranchForm } from "@/components/new-branch-form";
import { BranchCard } from "@/components/branch-card";
import { SynthesizeButton } from "@/components/synthesize-button";
import { Button } from "@/components/ui/button";
import type { Branch, Comment } from "@/lib/types";

export function TreeView({
  initialBranches,
  currentUserId,
}: {
  initialBranches: Branch[];
  currentUserId: string;
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
        { event: "INSERT", schema: "public", table: "branches" },
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
        { event: "DELETE", schema: "public", table: "branches" },
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
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">🌳 나무</h1>
          <p className="text-sm text-muted-foreground">
            가지 {branches.length}개
            {" · "}{selectedIds.size}개 선택됨
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          />
        </div>
      </header>

      <div className="mb-6">
        <NewBranchForm onCreated={upsertBranch} />
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
