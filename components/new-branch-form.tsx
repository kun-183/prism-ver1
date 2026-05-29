"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Branch } from "@/lib/types";

export function NewBranchForm({
  onCreated,
}: {
  onCreated: (branch: Branch) => void;
}) {
  const [idea, setIdea] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = idea.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("branches")
      .insert({ idea: trimmed })
      .select("id, author_id, idea, created_at")
      .single();

    setSaving(false);
    if (error) {
      setError("저장 실패: " + error.message);
      return;
    }
    setIdea("");
    if (data) onCreated({ ...data, comments: [] } as Branch);
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <Textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="번쩍 떠오른 직감 한 줄을 던져두세요…"
        rows={2}
        className="resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter</span>
        <Button onClick={submit} disabled={!idea.trim() || saving} size="sm">
          {saving ? "심는 중…" : "가지 심기"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
