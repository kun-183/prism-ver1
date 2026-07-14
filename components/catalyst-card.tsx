"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  MessageCircleMore,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { CatalystReaction, PipelineSynthesis } from "@/lib/types";

const REACTION_OPTIONS: Array<{
  value: CatalystReaction;
  label: string;
  prompt: string;
}> = [
  { value: "pulled", label: "끌린다", prompt: "어떤 가능성이 보이나요?" },
  { value: "uneasy", label: "불편하다", prompt: "무엇이 걸리거나 충돌하나요?" },
  { value: "missing", label: "빠졌다", prompt: "어떤 관점이 아직 없나요?" },
];

export function CatalystCard({
  result,
  branchNumber,
  upgrading,
  onUpgrade,
}: {
  result: PipelineSynthesis;
  branchNumber: Map<string, number>;
  upgrading: boolean;
  onUpgrade: () => void;
}) {
  const [reaction, setReaction] = useState<CatalystReaction | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveReaction() {
    if (!reaction || !result.run_id || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/synthesis-reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: result.run_id, reaction, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "반응을 기록하지 못했습니다.");
      setSavedCount(data.reaction_count ?? 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  if (!result.synthesis_possible || !result.catalyst) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex gap-3 py-2 text-sm text-muted-foreground">
          <CircleHelp className="mt-0.5 size-4 shrink-0" />
          <p>{result.refusal_reason ?? "이 조합에서는 정직하게 촉매 생성을 멈췄습니다."}</p>
        </CardContent>
      </Card>
    );
  }

  const selectedContext = result.material_selection.selected_comment_ids.length;
  const availableContext = result.material_selection.available_comment_count;
  const selectedOption = REACTION_OPTIONS.find((option) => option.value === reaction);

  return (
    <Card className="overflow-hidden border-emerald-500/30 bg-[linear-gradient(145deg,var(--card)_65%,oklch(0.96_0.03_160))] shadow-[0_18px_50px_-34px_oklch(0.55_0.14_160)]">
      <CardHeader className="border-b border-emerald-500/15 bg-emerald-500/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              <Sparkles className="size-3" /> 논의 도약 카드
            </Badge>
            <Badge variant="outline">
              {result.model_tier === "high" ? "깊은 재합성" : "빠른 초안"}
            </Badge>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            가지 {result.branch_ids.map((id) => `#${branchNumber.get(id) ?? "?"}`).join(" + ")}
            {" · "}맥락 {selectedContext}/{availableContext}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            <ArrowUpRight className="size-3.5" /> 아무도 놓지 않았던 각도
          </p>
          <blockquote className="text-balance text-xl font-semibold leading-relaxed tracking-tight sm:text-2xl">
            {result.catalyst.provocation}
          </blockquote>
        </section>

        <section className="rounded-xl border bg-background/75 p-4">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">왜 논의가 달라지는가</p>
          <p className="text-sm leading-6 text-foreground/85">{result.catalyst.reframe}</p>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">닫지 않고 남겨둘 긴장</p>
          <div className="flex flex-wrap gap-2">
            {result.catalyst.tensions.map((tension) => (
              <Badge key={tension} variant="secondary" className="h-auto whitespace-normal px-3 py-1.5 text-left leading-5">
                {tension}
              </Badge>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-foreground p-5 text-background">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-background/60">
            <Target className="size-4" /> 다음 라운드의 한 질문
          </p>
          <p className="text-lg font-semibold leading-relaxed">
            {result.catalyst.discussion_question}
          </p>
        </section>

        <section className="rounded-2xl border border-dashed p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">5′</div>
            <div>
              <h4 className="font-semibold">이제 팀이 할 일</h4>
              <p className="text-sm text-muted-foreground">
                30초간 읽고, 각자 하나의 반응을 남긴 뒤 위 질문으로 논의를 다시 엽니다.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {REACTION_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={reaction === option.value ? "default" : "outline"}
                onClick={() => setReaction(option.value)}
                className="px-2"
              >
                {option.label}
              </Button>
            ))}
          </div>

          {reaction && (
            <div className="mt-3 space-y-2">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 1000))}
                placeholder={selectedOption?.prompt}
                rows={2}
                className="resize-none bg-background"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {savedCount === null
                    ? "한 사람의 반응도 후속 논의 발생으로 기록됩니다."
                    : `기록됨 · 현재 ${savedCount}명 반응`}
                </p>
                <Button
                  size="sm"
                  onClick={saveReaction}
                  disabled={!result.run_id || saving}
                >
                  {savedCount !== null ? <Check className="size-4" /> : <MessageCircleMore className="size-4" />}
                  {saving ? "기록 중…" : savedCount !== null ? "기록 수정" : "반응 기록"}
                </Button>
              </div>
              {!result.run_id && (
                <p className="text-xs text-amber-700">저장 ID가 없어 이 결과의 반응은 기록할 수 없습니다.</p>
              )}
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            </div>
          )}
        </section>

        {Object.keys(result.contribution).length > 0 && (
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">입력 근거와 기여 추적</summary>
            <div className="mt-2 space-y-1 rounded-lg bg-muted/60 p-3">
              {Object.entries(result.contribution).map(([part, ids]) => (
                <p key={part}>
                  <span className="text-foreground">{part}</span>
                  {" ← "}
                  {ids.map((id) => `#${branchNumber.get(id) ?? "?"}`).join(", ")}
                </p>
              ))}
            </div>
          </details>
        )}

        {result.model_tier === "draft" && (
          <Button variant="outline" size="sm" onClick={onUpgrade} disabled={upgrading}>
            <Sparkles className="size-4" />
            {upgrading ? "더 깊게 재합성 중…" : "이 각도를 더 깊게 재합성"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
