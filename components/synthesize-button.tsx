"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { SynthesisResult } from "@/lib/synthesis-prompt";
import type { Branch } from "@/lib/types";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: SynthesisResult }
  | { phase: "error"; message: string };

// 표시용 모델 목록(키는 서버 MODEL_MAP과 일치해야 함).
const MODELS = [
  { key: "haiku", label: "Haiku", hint: "빠름" },
  { key: "sonnet", label: "Sonnet", hint: "균형" },
  { key: "opus", label: "Opus", hint: "고품질" },
] as const;

type ModelKey = (typeof MODELS)[number]["key"];

export function SynthesizeButton({
  branches,
  selectedIds,
}: {
  branches: Branch[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [usedModel, setUsedModel] = useState<ModelKey>("sonnet");

  // 선택된 가지가 있으면 그것만, 없으면 전체를 대상으로.
  const target =
    selectedIds.length > 0
      ? branches.filter((b) => selectedIds.includes(b.id))
      : branches;
  const targetCount = target.length;

  // 2개 이상이면 가지끼리 합성. 1개면 그 가지의 잔가지로 내부 합성(잔가지 필요).
  const canRun =
    targetCount >= 2 ||
    (targetCount === 1 && target[0].comments.length >= 1);
  const disabled = !canRun;
  const disabledHint =
    targetCount === 1
      ? "가지를 하나만 쓰려면 그 가지에 잔가지가 1개 이상 있어야 합니다"
      : "합성하려면 가지를 최소 2개 선택(또는 전체 2개 이상)해야 합니다";

  async function run(model: ModelKey) {
    if (disabled) return;
    setUsedModel(model);
    setOpen(true);
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          branchIds: selectedIds.length > 0 ? selectedIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({
          phase: "error",
          message: data?.error ?? "합성에 실패했습니다.",
        });
        return;
      }
      setState({ phase: "done", result: data as SynthesisResult });
    } catch {
      setState({ phase: "error", message: "네트워크 오류. 다시 시도해 주세요." });
    }
  }

  const usedLabel = MODELS.find((m) => m.key === usedModel)?.label ?? usedModel;
  const targetLabel =
    selectedIds.length > 0 ? `선택한 ${targetCount}개 가지` : "전체 가지";

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs text-muted-foreground">
          ⟳ 돌려보기:
        </span>
        {MODELS.map((m) => (
          <Button
            key={m.key}
            onClick={() => run(m.key)}
            disabled={disabled}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            title={disabled ? disabledHint : `${m.label}로 ${targetLabel} 합성`}
          >
            {m.label}
            <span className="ml-1 text-[10px] opacity-75">{m.hint}</span>
          </Button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>N+1 합성 결과</DialogTitle>
            <DialogDescription>
              {usedLabel} · {targetLabel} · 입력 어느 것과도 같지 않은, 누구도
              혼자선 도달 못 했을 한 문장.
            </DialogDescription>
          </DialogHeader>

          {state.phase === "loading" && (
            <div className="space-y-3 py-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
              <p className="pt-2 text-center text-sm text-muted-foreground">
                충돌하는 직감들을 합성하는 중…
              </p>
            </div>
          )}

          {state.phase === "error" && (
            <div className="py-6">
              <p className="text-sm text-red-500">{state.message}</p>
              <Button
                onClick={() => run(usedModel)}
                variant="outline"
                size="sm"
                className="mt-4"
              >
                다시 시도
              </Button>
            </div>
          )}

          {state.phase === "done" && <ResultView result={state.result} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResultView({ result }: { result: SynthesisResult }) {
  if (!result.synthesis_possible) {
    return (
      <div className="py-4">
        <Badge variant="secondary" className="mb-3">
          합성 거부 (정직한 결과)
        </Badge>
        <p className="text-sm leading-relaxed text-foreground/80">
          {result.refusal_reason ??
            "이 조합으로는 N+1을 만들 수 없습니다. 더 다양한 직감을 쌓아보세요."}
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {result.diversity_warning && (
        <Badge variant="outline" className="mb-3 border-amber-400 text-amber-600">
          ⚠ {result.diversity_warning}
        </Badge>
      )}
      <blockquote className="border-l-4 border-emerald-500 py-1 pl-4 text-lg font-semibold leading-relaxed">
        {result.X}
      </blockquote>

      {result.dimensions?.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            추출된 차원
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.dimensions.map((d, i) => (
              <Badge key={i} variant="secondary" className="font-normal">
                {d}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
