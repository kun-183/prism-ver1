"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NewBranchForm } from "@/components/new-branch-form";
import { BranchCard } from "@/components/branch-card";
import { SynthesizeButton } from "@/components/synthesize-button";
import type { Branch, Comment } from "@/lib/types";

export function TreeView({ initialBranches }: { initialBranches: Branch[] }) {
  const [branches, setBranches] = useState<Branch[]>(initialBranches);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">🌳 나무</h1>
          <p className="text-sm text-muted-foreground">
            가지 {branches.length}개 · 직감을 쌓고 돌려보세요
          </p>
        </div>
        <SynthesizeButton branchCount={branches.length} />
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
              onCommentCreated={addComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
