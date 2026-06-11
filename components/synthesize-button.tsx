"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  | { phase: "pin" } // 돌려보기 전 4자리 PIN 입력
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
  const [pin, setPin] = useState("");

  // 선택된 가지가 있으면 그것만, 없으면 전체를 대상으로.
  const target =
    selectedIds.length > 0
      ? branches.filter((b) => selectedIds.includes(b.id))
      : branches;
  const targetCount = target.length;

  // 입력 개수와 잔가지 유무와 무관하게 서버는 항상 같은 4단계 독립 호출을 실행한다.
  const canRun = targetCount >= 1;
  const disabled = !canRun;
  const disabledHint = "합성하려면 가지가 최소 1개 있어야 합니다";

  // 모델 버튼 클릭 → PIN 입력 단계로. (실제 합성은 PIN 확인 후 submit에서 실행)
  function run(model: ModelKey) {
    if (disabled) return;
    setUsedModel(model);
    setOpen(true);
    setState({ phase: "pin" });
  }

  const pinValid = /^\d{4}$/.test(pin);

  // PIN 확인 후 합성 실행. 서버가 PIN을 검증한다(틀리면 403).
  async function submit() {
    if (!pinValid) return;
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: usedModel,
          branchIds: selectedIds.length > 0 ? selectedIds : undefined,
          pin,
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
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {state.phase === "pin" ? "🔒 돌려보기 잠금" : "N+1 합성 결과"}
            </DialogTitle>
            <DialogDescription>
              {state.phase === "pin"
                ? `${usedLabel}로 ${targetLabel}를 합성합니다.`
                : `${usedLabel} · ${targetLabel} · 입력 어느 것과도 같지 않은, 누구도 혼자선 도달 못 했을 한 문장.`}
            </DialogDescription>
          </DialogHeader>

          {state.phase === "pin" && (
            <div className="py-4">
              <p className="mb-3 text-sm text-muted-foreground">
                돌려보기는 4자리 PIN이 필요합니다.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={4}
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  placeholder="••••"
                  className="w-28 text-center tracking-[0.5em]"
                />
                <Button
                  onClick={submit}
                  disabled={!pinValid}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  확인
                </Button>
              </div>
            </div>
          )}

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
                onClick={() => setState({ phase: "pin" })}
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
      <div className="min-w-0 py-4">
        <Badge variant="secondary" className="mb-3">
          합성 거부 (정직한 결과)
        </Badge>
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">
          {result.refusal_reason ??
            "이 조합으로는 N+1을 만들 수 없습니다. 더 다양한 직감을 쌓아보세요."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 py-2">
      {result.diversity_warning && (
        <Badge
          variant="outline"
          className="mb-3 h-auto min-h-5 max-w-full justify-start whitespace-normal border-amber-400 text-left leading-relaxed break-words text-amber-600 [overflow-wrap:anywhere]"
        >
          ⚠ {result.diversity_warning}
        </Badge>
      )}
      <blockquote className="min-w-0 whitespace-pre-wrap break-words border-l-4 border-emerald-500 py-1 pl-4 text-lg font-semibold leading-relaxed [overflow-wrap:anywhere]">
        {result.X}
      </blockquote>

      {result.dimensions?.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            추출된 차원
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.dimensions.map((d, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="h-auto min-h-5 max-w-full whitespace-normal text-left break-words font-normal [overflow-wrap:anywhere]"
              >
                {d}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
