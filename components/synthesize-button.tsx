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

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: SynthesisResult }
  | { phase: "error"; message: string };

export function SynthesizeButton({ branchCount }: { branchCount: number }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run() {
    setOpen(true);
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/synthesize", { method: "POST" });
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

  const disabled = branchCount < 2;

  return (
    <>
      <Button
        onClick={run}
        disabled={disabled}
        size="lg"
        className="bg-emerald-600 hover:bg-emerald-700"
        title={disabled ? "가지가 최소 2개 필요합니다" : undefined}
      >
        ⟳ 돌려보기
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>N+1 합성 결과</DialogTitle>
            <DialogDescription>
              입력 어느 것과도 같지 않은, 누구도 혼자선 도달 못 했을 한 문장.
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
              <Button onClick={run} variant="outline" size="sm" className="mt-4">
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
