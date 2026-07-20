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
  currentUserId,
  selected,
  onToggleSelect,
  onCommentCreated,
  onBranchDeleted,
  onCommentDeleted,
  selectionMode = true,
}: {
  branch: Branch;
  index: number;
  currentUserId: string;
  selected: boolean;
  onToggleSelect: () => void;
  onCommentCreated: (comment: Comment) => void;
  onBranchDeleted: (branchId: string) => void;
  onCommentDeleted: (commentId: string) => void;
  selectionMode?: boolean;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const ownBranch = branch.author_id === currentUserId;

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

  async function deleteBranch() {
    if (deleting) return;
    const n = branch.comments.length;
    const msg =
      n > 0
        ? `이 가지를 삭제하면 잔가지 ${n}개도 함께 삭제됩니다. 계속할까요?`
        : "이 가지를 삭제할까요?";
    if (!window.confirm(msg)) return;

    setDeleting(true);
    const supabase = createClient();
    // 잔가지는 FK on delete cascade 로 함께 삭제됨.
    const { error } = await supabase
      .from("branches")
      .delete()
      .eq("id", branch.id);
    setDeleting(false);
    if (!error) onBranchDeleted(branch.id);
    else window.alert("삭제에 실패했습니다. 본인이 만든 가지만 삭제할 수 있어요.");
  }

  async function deleteComment(comment: Comment) {
    const supabase = createClient();
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", comment.id);
    if (!error) onCommentDeleted(comment.id);
    else
      window.alert(
        "잔가지 삭제에 실패했습니다. 본인이 만든 잔가지만 삭제할 수 있어요.",
      );
  }

  return (
    <div
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 transition-colors ${
        selected ? "ring-2 ring-[#0071e3]/35" : "ring-black/[.05]"
      }`}
    >
      <div className="flex items-start gap-3">
        {selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label="이 가지를 합성에 포함"
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#0071e3]"
          />
        )}
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8f2ff] text-xs font-semibold text-[#0071e3]">
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
        {ownBranch && (
          <button
            onClick={deleteBranch}
            disabled={deleting}
            aria-label="가지 삭제"
            title="가지 삭제 (잔가지 포함)"
            className="shrink-0 rounded-full p-1.5 text-muted-foreground/60 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
          >
            🗑
          </button>
        )}
      </div>

      {branch.comments.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-l-2 border-muted pl-4">
          {branch.comments.map((c) => (
            <li
              key={c.id}
              className="group flex items-start gap-1.5 text-sm text-foreground/80"
            >
              <span className="text-muted-foreground">└ </span>
              <span className="flex-1">{c.body}</span>
              {c.author_id === currentUserId && (
                <button
                  onClick={() => deleteComment(c)}
                  aria-label="잔가지 삭제"
                  title="잔가지 삭제"
                  className="shrink-0 rounded px-1 text-xs text-muted-foreground/0 transition-colors hover:text-red-600 group-hover:text-muted-foreground/60"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2 pl-4">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={selectionMode ? "잔가지 달기 (맥락·이견·보강)…" : "먼저 생각을 더 발전시키거나 근거를 덧붙이세요…"}
          className="h-9 bg-[#f5f5f7] text-sm"
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
