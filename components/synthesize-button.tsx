"use client";

import { useState } from "react";
import {
  ArrowRight,
  ListFilter,
  Layers3,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CatalystCard } from "@/components/catalyst-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  Branch,
  CombinationCandidate,
  PipelineDimension,
  PipelineSynthesis,
} from "@/lib/types";

type Phase = "pin" | "dimensions" | "combinations" | "materials" | "results";

export function SynthesizeButton({
  branches,
  selectedIds,
  projectId,
}: {
  branches: Branch[];
  selectedIds: string[];
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("pin");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<PipelineDimension[]>([]);
  const [keptDimensionIds, setKeptDimensionIds] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<CombinationCandidate[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(
    new Set(),
  );
  const [results, setResults] = useState<PipelineSynthesis[]>([]);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const [diversityWarning, setDiversityWarning] = useState<string | null>(null);

  const branchIds = selectedIds;
  const selectedBranches = branches.filter((branch) =>
    branchIds.includes(branch.id),
  );
  const branchNumber = new Map(branches.map((branch, index) => [branch.id, index + 1]));
  const keptDimensions = dimensions.filter((dimension) =>
    keptDimensionIds.has(dimension.id),
  );
  const selectedCandidates = candidates.filter((candidate) =>
    selectedCandidateIds.has(candidate.id),
  );
  const materialBranchIds = new Set(
    selectedCandidates.flatMap((candidate) => candidate.branch_ids),
  );
  const materialBranches = branches.filter((branch) =>
    materialBranchIds.has(branch.id),
  );
  const availableComments = materialBranches.flatMap((branch) => branch.comments);

  async function post<T>(action: string, payload: Record<string, unknown> = {}) {
    const response = await fetch("/api/synthesize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, pin, projectId, branchIds, ...payload }),
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data?.detail
        ? `${data.error ?? "요청에 실패했습니다."} · ${data.detail}`
        : data?.error ?? "요청에 실패했습니다.";
      throw new Error(message);
    }
    return data as T;
  }

  function start() {
    setOpen(true);
    setPhase("pin");
    setError(null);
  }

  function reset() {
    setPhase("pin");
    setDimensions([]);
    setKeptDimensionIds(new Set());
    setCandidates([]);
    setSelectedCandidateIds(new Set());
    setSelectedCommentIds(new Set());
    setResults([]);
    setDiversityWarning(null);
    setError(null);
  }

  async function extract() {
    if (!/^\d{4}$/.test(pin)) return;
    setLoading("차원을 추출하는 중");
    setError(null);
    try {
      const data = await post<{
        dimensions: PipelineDimension[];
        diversity_warning: string | null;
      }>("extract_dimensions");
      setDimensions(data.dimensions);
      setKeptDimensionIds(new Set(data.dimensions.map((item) => item.id)));
      setDiversityWarning(data.diversity_warning);
      setPhase("dimensions");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(null);
    }
  }

  async function makeCombinations() {
    setLoading("조합 후보를 만드는 중");
    setError(null);
    try {
      const data = await post<{
        candidates: CombinationCandidate[];
        refusal_reason: string | null;
      }>("generate_combinations", { dimensions: keptDimensions });
      setCandidates(data.candidates);
      setSelectedCandidateIds(
        new Set(data.candidates.slice(0, 6).map((item) => item.id)),
      );
      setError(data.refusal_reason);
      setPhase("combinations");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(null);
    }
  }

  async function synthesize() {
    const combinations = selectedCandidates;
    setLoading(`${combinations.length}개 조합을 자동 합성하는 중`);
    setError(null);
    try {
      const data = await post<{ results: PipelineSynthesis[] }>(
        "synthesize_combinations",
        {
          dimensions: keptDimensions,
          combinations,
          selectedCommentIds: Array.from(selectedCommentIds),
        },
      );
      setResults((current) => [...current, ...data.results]);
      setPhase("results");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(null);
    }
  }

  function reviewMaterials() {
    const allowedIds = new Set(availableComments.map((comment) => comment.id));
    setSelectedCommentIds((current) =>
      new Set(Array.from(current).filter((id) => allowedIds.has(id))),
    );
    setPhase("materials");
  }

  async function upgrade(result: PipelineSynthesis) {
    const combination = candidates.find(
      (candidate) => candidate.id === result.combination_id,
    );
    if (!combination) return;
    setUpgradingId(result.id);
    setError(null);
    try {
      const data = await post<{ result: PipelineSynthesis }>(
        "upgrade_synthesis",
        {
          dimensions: keptDimensions,
          combination,
          previousX: result.X,
          selectedCommentIds: Array.from(selectedCommentIds),
        },
      );
      setResults((current) => [...current, data.result]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUpgradingId(null);
    }
  }

  return (
    <>
      <Button
        onClick={start}
        disabled={branchIds.length === 0}
        size="sm"
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        <Sparkles className="size-4" />
        논의 도약 만들기
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers3 className="size-5 text-emerald-600" />
              논의 도약 설계
            </DialogTitle>
            <DialogDescription>
              관점과 재료는 사람이 고르고, 도구는 다음 논의를 여는 촉매를 만듭니다. 선택한 가지 {branchIds.length}개
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {["1 차원", "2 조합", "3 재료", "4 촉매"].map((label, index) => (
              <Badge
                key={label}
                variant={
                  index <= ({ pin: 0, dimensions: 0, combinations: 1, materials: 2, results: 3 } as const)[phase]
                    ? "default"
                    : "secondary"
                }
              >
                {label}
              </Badge>
            ))}
          </div>

          {loading && (
            <Card>
              <CardContent className="space-y-3 pt-1">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-16 w-full" />
                <p className="text-center text-sm text-muted-foreground">{loading}…</p>
              </CardContent>
            </Card>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {!loading && phase === "pin" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LockKeyhole className="size-4" /> 실행 잠금
                </CardTitle>
                <CardDescription>
                  선택한 가지를 확인하고 4자리 PIN으로 차원 추출을 시작하세요.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {selectedBranches.map((branch) => (
                    <Badge key={branch.id} variant="secondary" className="max-w-full truncate">
                      #{branchNumber.get(branch.id)} {branch.idea}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoFocus
                    maxLength={4}
                    value={pin}
                    onChange={(event) =>
                      setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    onKeyDown={(event) => event.key === "Enter" && extract()}
                    placeholder="••••"
                    className="w-28 text-center tracking-[0.45em]"
                  />
                  <Button onClick={extract} disabled={!/^\d{4}$/.test(pin)}>
                    차원 추출 <ArrowRight className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!loading && phase === "dimensions" && (
            <section className="space-y-3">
              <div>
                <h3 className="font-medium">차원 거름망</h3>
                <p className="text-sm text-muted-foreground">
                  이후 조합에 사용할 차원만 남겨주세요.
                </p>
              </div>
              {diversityWarning && (
                <Badge variant="outline" className="h-auto whitespace-normal border-amber-400">
                  ⚠ {diversityWarning}
                </Badge>
              )}
              {dimensions.map((dimension) => {
                const kept = keptDimensionIds.has(dimension.id);
                return (
                  <Card key={dimension.id} size="sm" className={kept ? "ring-emerald-500" : "opacity-55"}>
                    <CardContent className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={kept}
                        onChange={() =>
                          setKeptDimensionIds((current) => {
                            const next = new Set(current);
                            if (next.has(dimension.id)) next.delete(dimension.id);
                            else next.add(dimension.id);
                            return next;
                          })
                        }
                        aria-label={`${dimension.label} 차원 유지`}
                        className="mt-1 size-4 accent-emerald-600"
                      />
                      <div className="min-w-0">
                        <p className="font-medium">{dimension.label}</p>
                        <p className="text-sm text-muted-foreground">{dimension.description}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          관련 가지 {dimension.branch_ids.map((id) => `#${branchNumber.get(id) ?? "?"}`).join(", ")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={reset}><RotateCcw className="size-4" />처음부터</Button>
                <Button onClick={makeCombinations} disabled={keptDimensions.length === 0}>
                  조합 후보 만들기 <ArrowRight className="size-4" />
                </Button>
              </div>
            </section>
          )}
          {!loading && phase === "combinations" && (
            <section className="space-y-3">
              <div>
                <h3 className="font-medium">조합 후보 선택</h3>
                <p className="text-sm text-muted-foreground">
                  합성할 후보를 복수 선택하세요. 한 번에 최대 6개를 자동 처리합니다.
                </p>
              </div>
              {candidates.map((candidate) => {
                const selected = selectedCandidateIds.has(candidate.id);
                return (
                  <Card key={candidate.id} size="sm" className={selected ? "ring-emerald-500" : "opacity-60"}>
                    <CardContent className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setSelectedCandidateIds((current) => {
                            const next = new Set(current);
                            if (next.has(candidate.id)) next.delete(candidate.id);
                            else if (next.size < 6) next.add(candidate.id);
                            return next;
                          })
                        }
                        aria-label={`${candidate.id} 조합 선택`}
                        className="mt-1 size-4 accent-emerald-600"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge>{candidate.shared_dimension}</Badge>
                          {candidate.branch_ids.map((id) => (
                            <Badge key={id} variant="secondary">#{branchNumber.get(id) ?? "?"}</Badge>
                          ))}
                        </div>
                        <p className="font-medium">{candidate.tension}</p>
                        <p className="text-sm text-muted-foreground">{candidate.rationale}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setPhase("dimensions")}>차원 다시 고르기</Button>
                <Button onClick={reviewMaterials} disabled={selectedCandidateIds.size === 0}>
                  <ListFilter className="size-4" />
                  합성 재료 선별 <ArrowRight className="size-4" />
                </Button>
              </div>
            </section>
          )}

          {!loading && phase === "materials" && (
            <section className="space-y-4">
              <div>
                <h3 className="flex items-center gap-2 font-medium">
                  <ListFilter className="size-4 text-emerald-600" /> 합성 재료 선별
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  가지 본문은 항상 쓰고, 실제로 의미 있는 맥락만 체크하세요. 체크하지 않은 잔가지는 3·4단계에서 완전히 제외됩니다.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  핵심 가지 {materialBranches.length}개 · 맥락 {selectedCommentIds.size}/{availableComments.length}개 선택
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCommentIds(new Set())}
                    disabled={selectedCommentIds.size === 0}
                  >
                    맥락 없이
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCommentIds(new Set(availableComments.map((comment) => comment.id)))}
                    disabled={availableComments.length === 0 || selectedCommentIds.size === availableComments.length}
                  >
                    모두 선택
                  </Button>
                </div>
              </div>

              {materialBranches.map((branch) => (
                <Card key={branch.id} size="sm">
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-2">
                      <Badge className="mt-0.5 shrink-0">#{branchNumber.get(branch.id) ?? "?"}</Badge>
                      <div>
                        <p className="font-medium leading-relaxed">{branch.idea}</p>
                        <p className="mt-1 text-xs font-medium text-emerald-700">핵심 재료 · 항상 포함</p>
                      </div>
                    </div>
                    {branch.comments.length > 0 ? (
                      <div className="space-y-2 border-l-2 border-muted pl-4">
                        {branch.comments.map((comment) => {
                          const selected = selectedCommentIds.has(comment.id);
                          return (
                            <label
                              key={comment.id}
                              className={`flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm transition-colors ${
                                selected ? "bg-emerald-500/10 text-foreground" : "text-muted-foreground hover:bg-muted/70"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  setSelectedCommentIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(comment.id)) next.delete(comment.id);
                                    else next.add(comment.id);
                                    return next;
                                  })
                                }
                                className="mt-1 size-4 shrink-0 accent-emerald-600"
                              />
                              <span>{comment.body}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">선별할 추가 맥락이 없습니다.</p>
                    )}
                  </CardContent>
                </Card>
              ))}

              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-sm">
                <p className="font-medium">선별 규칙</p>
                <p className="mt-1 text-muted-foreground">
                  판단 근거를 더하거나 실제 긴장을 드러내는 맥락만 포함합니다. 반복·농담·주제 이탈은 제외해 압축 손실을 줄입니다.
                </p>
              </div>

              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setPhase("combinations")}>조합 다시 고르기</Button>
                <Button onClick={synthesize} disabled={selectedCandidateIds.size === 0}>
                  <WandSparkles className="size-4" />
                  {selectedCandidateIds.size}개 논의 촉매 만들기
                </Button>
              </div>
            </section>
          )}

          {!loading && phase === "results" && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">논의 도약 카드</h3>
                  <p className="text-sm text-muted-foreground">
                    이 결과는 결론이 아닙니다. 팀이 반응하고 다시 말하게 만드는 다음 논의의 출발점입니다.
                  </p>
                </div>
                <Badge variant="secondary">{results.length}개 결과</Badge>
              </div>
              {results.map((result) => (
                <CatalystCard
                  key={result.id}
                  result={result}
                  branchNumber={branchNumber}
                  upgrading={upgradingId === result.id}
                  onUpgrade={() => upgrade(result)}
                />
              ))}
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setPhase("materials")}>재료를 바꿔 다시 도약</Button>
                <Button variant="outline" onClick={reset}><RotateCcw className="size-4" />새 논의 도약</Button>
              </div>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
