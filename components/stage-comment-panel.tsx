"use client";

import { useState } from "react";
import { LoaderCircle, MessageCircleMore, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProcessStage, StageComment } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function StageCommentPanel({
  projectId,
  currentUserId,
  stage,
  title,
  prompt,
  comments,
  onCreated,
  onDeleted,
  disabled = false,
  accent = "blue",
  className,
}: {
  projectId: string;
  currentUserId: string;
  stage: ProcessStage;
  title: string;
  prompt: string;
  comments: StageComment[];
  onCreated: (comment: StageComment) => void;
  onDeleted: (id: string) => void;
  disabled?: boolean;
  accent?: "blue" | "purple";
  className?: string;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accentClass = accent === "purple" ? "text-[#6e4bd8]" : "text-[#0071e3]";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanBody = body.trim();
    if (!cleanBody || disabled) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("stage_comments")
      .insert({ project_id: projectId, stage, author_id: currentUserId, body: cleanBody })
      .select("id, project_id, stage, author_id, body, created_at")
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onCreated(data as StageComment);
    setBody("");
  }

  async function remove(comment: StageComment) {
    if (comment.author_id !== currentUserId) return;
    setDeletingId(comment.id);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("stage_comments")
      .delete()
      .eq("id", comment.id)
      .eq("author_id", currentUserId);
    setDeletingId(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onDeleted(comment.id);
  }

  return (
    <section className={cn("rounded-[24px] bg-white/80 p-4 shadow-sm ring-1 ring-black/[.05] sm:p-5", className)} aria-labelledby={`stage-${stage}-comments-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={`stage-${stage}-comments-title`} className={cn("flex items-center gap-2 text-sm font-bold", accentClass)}>
            <MessageCircleMore className="size-4" /> {title}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#6e6e73]">{prompt}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#f2f2f7] px-2.5 py-1 font-mono text-[10px] text-[#6e6e73]">{comments.length} COMMENT</span>
      </div>

      <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1" aria-live="polite">
        {comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 px-3 py-4 text-center text-xs leading-5 text-[#86868b]">
            아직 남긴 직감이 없습니다. AI가 놓치면 안 될 관점이나 불편함을 적어 주세요.
          </div>
        ) : comments.map((comment) => {
          const mine = comment.author_id === currentUserId;
          return (
            <article key={comment.id} className={cn("rounded-2xl px-3 py-2.5", mine ? "bg-[#eef6ff]" : "bg-[#f5f5f7]")}>
              <div className="flex items-center justify-between gap-2 text-[10px] text-[#86868b]">
                <span className="font-semibold">{mine ? "내 직감" : "팀원의 직감"} · {dateFormatter.format(new Date(comment.created_at))}</span>
                {mine && (
                  <button type="button" onClick={() => remove(comment)} disabled={deletingId === comment.id} className="rounded-md p-1 transition hover:bg-black/[.06] hover:text-red-600" aria-label="코멘트 삭제">
                    {deletingId === comment.id ? <LoaderCircle className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p>
            </article>
          );
        })}
      </div>

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          disabled={disabled || saving}
          placeholder={disabled ? "이 단계가 열리면 코멘트를 남길 수 있습니다." : "내가 느낀 핵심, 빠진 관점, 반대 의견…"}
          aria-label={`${title} 작성`}
          className="min-h-20 flex-1 resize-none bg-white text-sm"
        />
        <Button type="submit" size="icon" disabled={disabled || saving || !body.trim()} className={cn("shrink-0 text-white", accent === "purple" ? "bg-[#7b61ff] hover:bg-[#6e55e0]" : "bg-[#0071e3] hover:bg-[#0077ed]")} aria-label="코멘트 등록">
          {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs leading-5 text-red-700">{error}</p>}
      <p className="mt-2 text-[10px] leading-4 text-[#86868b]">이 코멘트는 다음 AI 실행에 팀의 가설·우선순위로 전달되며, 검증된 사실로 취급되지 않습니다.</p>
    </section>
  );
}
