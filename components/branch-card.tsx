"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Branch, Comment } from "@/lib/types";

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function BranchCard({
  branch,
  index,
  onCommentCreated,
}: {
  branch: Branch;
  index: number;
  onCommentCreated: (comment: Comment) => void;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function addComment() {
    const trimmed = body.trim();
    if (!trimmed || saving) return;
    setSaving(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("comments")
      .insert({ branch_id: branch.id, body: trimmed })
      .select("id, branch_id, author_id, body, created_at")
      .single();

    setSaving(false);
    if (!error && data) {
      setBody("");
      onCommentCreated(data as Comment);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
          {index + 1}
        </span>
        <div className="flex-1">
          <p className="text-[15px] font-medium leading-relaxed">
            {branch.idea}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {timeAgo(branch.created_at)}
          </p>
        </div>
      </div>

      {branch.comments.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-l-2 border-muted pl-4">
          {branch.comments.map((c) => (
            <li key={c.id} className="text-sm text-foreground/80">
              <span className="text-muted-foreground">└ </span>
              {c.body}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2 pl-4">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="잔가지 달기 (맥락·이견·보강)…"
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") addComment();
          }}
        />
        <Button
          onClick={addComment}
          disabled={!body.trim() || saving}
          size="sm"
          variant="secondary"
        >
          달기
        </Button>
      </div>
    </div>
  );
}
