"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  ExternalLink,
  Layers3,
  Lightbulb,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StageCommentPanel } from "@/components/stage-comment-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  FinalProblemDefinition,
  SolutionCandidate,
  SolutionCategory,
  SolutionReference,
  SolutionSynthesisRun,
  StageComment,
} from "@/lib/types";
import { SOLUTION_CATEGORIES } from "@/lib/types";

type CandidateDraft = {
  label: string;
  statement: string;
  essence_link: string;
  tradeoff: string;
};

const EMPTY_DRAFT: CandidateDraft = {
  label: "",
  statement: "",
  essence_link: "",
  tradeoff: "",
};

export function SolutionWorkspace({
  projectId,
  currentUserId,
  definition,
  initialCandidates,
  initialReferences,
  initialSyntheses,
  stageComments,
  onStageCommentCreated,
  onStageCommentDeleted,
}: {
  projectId: string;
  currentUserId: string;
  definition: FinalProblemDefinition;
  initialCandidates: SolutionCandidate[];
  initialReferences: SolutionReference[];
  initialSyntheses: SolutionSynthesisRun[];
  stageComments: StageComment[];
  onStageCommentCreated: (comment: StageComment) => void;
  onStageCommentDeleted: (id: string) => void;
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [references, setReferences] = useState(initialReferences);
  const [syntheses, setSyntheses] = useState(initialSyntheses);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState<SolutionCategory | null>(null);
  const [draft, setDraft] = useState<CandidateDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const referenceCountByCandidate = useMemo(() => {
    const counts = new Map<string, number>();
    references.forEach((item) => counts.set(item.candidate_id, (counts.get(item.candidate_id) ?? 0) + 1));
    return counts;
  }, [references]);
  const representedCategories = new Set(candidates.map((candidate) => candidate.category)).size;
  const candidatesWithoutEvidence = candidates.filter((candidate) => !referenceCountByCandidate.has(candidate.id));
  const selectedWithoutEvidence = selectedIds.filter((id) => !referenceCountByCandidate.has(id));
  const canSynthesize = selectedIds.length >= 2 && selectedIds.length <= 5 && selectedWithoutEvidence.length === 0;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`solution-stage-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "solution_candidates", filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id: string }).id;
          setCandidates((items) => items.filter((item) => item.id !== id));
          setSelectedIds((items) => items.filter((item) => item !== id));
        } else setCandidates((items) => upsert(items, payload.new as SolutionCandidate));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "solution_references", filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "DELETE") setReferences((items) => items.filter((item) => item.id !== (payload.old as { id: string }).id));
        else setReferences((items) => upsert(items, payload.new as SolutionReference));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "solution_syntheses", filter: `project_id=eq.${projectId}` }, (payload) => {
        setSyntheses((items) => upsert(items, payload.new as SolutionSynthesisRun));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [projectId]);

  async function runAction(action: "generate" | "research" | "synthesize", candidateIds?: string[]) {
    const busyKey = action === "research" ? `research:${candidateIds?.[0]}` : action;
    setBusy(busyKey);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/solutions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, projectId, candidateIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ? `${data.error} · ${data.detail}` : data.error);
      if (Array.isArray(data.candidates)) {
        setCandidates((items) => data.candidates.reduce((next: SolutionCandidate[], item: SolutionCandidate) => upsert(next, item), items));
      }
      if (Array.isArray(data.references)) {
        setReferences((items) => data.references.reduce((next: SolutionReference[], item: SolutionReference) => upsert(next, item), items));
      }
      if (data.synthesis) {
        setSyntheses((items) => upsert(items, data.synthesis as SolutionSynthesisRun));
        setSelectedIds([]);
        window.setTimeout(() => document.getElementById("latest-solution-synthesis")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      }
      if (action === "generate") {
        setNotice(data.reference_warning
          ? `5계열 후보를 만들었습니다. ${data.reference_warning}`
          : "5계열 후보와 실제 선례를 함께 만들었습니다.");
      } else if (action === "research") setNotice("후보에 실제 선례를 연결했습니다.");
      else setNotice("선택한 후보에 기존 N+1 Synthesis를 적용했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  async function addCandidate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addingCategory || Object.values(draft).some((value) => !value.trim())) return;
    setBusy(`manual:${addingCategory}`);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase.from("solution_candidates").insert({
      project_id: projectId,
      author_id: currentUserId,
      source: "human",
      category: addingCategory,
      ...draft,
    }).select("*").single();
    setBusy(null);
    if (insertError) setError(insertError.message);
    else {
      setCandidates((items) => upsert(items, data as SolutionCandidate));
      setDraft(EMPTY_DRAFT);
      setAddingCategory(null);
      setNotice("팀 후보를 추가했습니다. AI 선례 찾기로 근거를 붙여 주세요.");
    }
  }

  function toggleSynthesisMaterial(id: string) {
    setSelectedIds((items) => items.includes(id)
      ? items.filter((item) => item !== id)
      : items.length < 5 ? [...items, id] : items);
  }

  return (
    <section className="mt-14 border-t border-black/[.07] pt-10" aria-labelledby="solution-stage-heading">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <p className="font-mono text-xs text-[#7b61ff]">06 / SOLUTION DIVERGENCE</p>
          <h2 id="solution-stage-heading" className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
            한 가지 형태에 갇히지 않고,<br /><span className="text-[#7b61ff]">다섯 계열</span>로 펼칩니다.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-[#6e6e73]">
            AI는 발산과 선례 조사만 돕습니다. 어떤 후보가 맞는지는 점수나 투표 없이 팀이 직접 판단하세요.
          </p>
        </div>
        <div className="rounded-[24px] bg-[#1d1d1f] p-5 text-white shadow-[0_20px_50px_rgba(0,0,0,.18)]">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/50">Inherited essence</p>
          <p className="mt-2 text-sm font-semibold leading-6">{definition.root_cause}</p>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-white/60">{definition.statement}</p>
        </div>
      </div>

      {(error || notice) && (
        <div className={`mt-6 rounded-2xl px-4 py-3 text-sm ring-1 ${error ? "bg-red-50 text-red-800 ring-red-200" : "bg-[#f0ebff] text-[#5940a8] ring-[#7b61ff]/15"}`} role={error ? "alert" : "status"}>
          {error ?? notice}
        </div>
      )}

      <StageCommentPanel
        projectId={projectId}
        currentUserId={currentUserId}
        stage={6}
        title="06 · 솔루션 발산 — 팀의 직감"
        prompt="끌리는 후보, 불편한 트레이드오프, 합성에서 놓치면 안 될 현장 조건과 새로운 조합을 남겨 주세요."
        comments={stageComments}
        onCreated={onStageCommentCreated}
        onDeleted={onStageCommentDeleted}
        accent="purple"
        className="mt-6"
      />

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <Metric label="탐색한 계열" value={`${representedCategories}/5`} done={representedCategories >= 2} />
        <Metric label="근거 있는 후보" value={`${candidates.length - candidatesWithoutEvidence.length}/${candidates.length || 0}`} done={candidates.length > 0 && candidatesWithoutEvidence.length === 0} />
        <Metric label="본질 연결·트레이드오프" value={candidates.length ? "모든 후보" : "대기 중"} done={candidates.length > 0} />
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><Boxes className="size-5 text-[#7b61ff]" /> 5계열 발산 보드</div>
        <Button onClick={() => runAction("generate")} disabled={busy !== null} className="rounded-full bg-[#7b61ff] text-white hover:bg-[#6e55e0]">
          {busy === "generate" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy === "generate" ? "후보와 선례를 찾는 중…" : candidates.length ? "다른 5계열 후보 펼치기" : "5계열 후보와 선례 만들기"}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {SOLUTION_CATEGORIES.map((category) => {
          const categoryCandidates = candidates.filter((candidate) => candidate.category === category.key);
          return (
            <section key={category.key} className="min-w-0 rounded-[24px] bg-white/65 p-3 ring-1 ring-black/[.05]">
              <div className="px-1 pb-3 pt-1">
                <p className="text-sm font-bold">{category.label}</p>
                <p className="mt-0.5 text-[11px] text-[#86868b]">{category.hint}</p>
              </div>
              <div className="space-y-3">
                {categoryCandidates.length === 0 && <div className="rounded-2xl border border-dashed border-black/15 p-4 text-center text-xs leading-5 text-[#86868b]">아직 이 계열의 후보가 없습니다.</div>}
                {categoryCandidates.map((candidate) => {
                  const candidateReferences = references.filter((item) => item.candidate_id === candidate.id);
                  const selected = selectedIds.includes(candidate.id);
                  return <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    references={candidateReferences}
                    selected={selected}
                    onToggle={() => toggleSynthesisMaterial(candidate.id)}
                    onResearch={() => runAction("research", [candidate.id])}
                    researching={busy === `research:${candidate.id}`}
                    disabled={busy !== null}
                  />;
                })}
              </div>
              {addingCategory === category.key ? (
                <CandidateForm
                  categoryLabel={category.label}
                  value={draft}
                  onChange={setDraft}
                  onCancel={() => { setAddingCategory(null); setDraft(EMPTY_DRAFT); }}
                  onSubmit={addCandidate}
                  saving={busy === `manual:${category.key}`}
                />
              ) : (
                <Button variant="ghost" size="sm" className="mt-3 h-auto min-h-9 w-full whitespace-normal rounded-xl py-2 text-xs" onClick={() => { setAddingCategory(category.key); setDraft(EMPTY_DRAFT); }} disabled={busy !== null}>
                  <Plus className="size-3.5" /> 팀 후보 추가
                </Button>
              )}
            </section>
          );
        })}
      </div>

      <section className="mt-8 grid gap-5 rounded-[28px] bg-[linear-gradient(135deg,#eef6ff,#f3efff)] p-5 ring-1 ring-[#7b61ff]/10 lg:grid-cols-[1fr_auto] lg:items-center sm:p-7">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#6e4bd8]"><Layers3 className="size-4" /> Optional N+1 Synthesis</p>
          <h3 className="mt-2 text-xl font-semibold">후보를 고르는 대신, 후보 사이의 새 관점을 만듭니다.</h3>
          <p className="mt-2 text-sm leading-6 text-[#6e6e73]">근거가 붙은 후보 2~5개를 재료로 선택하세요. 이 선택은 최종 투표가 아니며 언제든 다시 조합할 수 있습니다.</p>
          <p className={`mt-2 text-xs font-semibold ${selectedWithoutEvidence.length ? "text-amber-700" : "text-[#6e4bd8]"}`}>
            {selectedIds.length}개 선택{selectedWithoutEvidence.length ? ` · 근거 없는 후보 ${selectedWithoutEvidence.length}개` : ""}
          </p>
        </div>
        <Button onClick={() => runAction("synthesize", selectedIds)} disabled={busy !== null || !canSynthesize} className="h-11 rounded-full bg-[#1d1d1f] px-5 text-white hover:bg-black">
          {busy === "synthesize" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy === "synthesize" ? "N+1 합성 중…" : <>선택 후보 Synthesis <ArrowRight className="size-4" /></>}
        </Button>
      </section>

      {syntheses.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3"><p className="text-sm font-bold">Synthesis 기록</p><div className="h-px flex-1 bg-black/[.08]" /></div>
          {[...syntheses].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((run, index) => (
            <SynthesisCard key={run.id} run={run} candidates={candidates} latest={index === 0} />
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, done }: { label: string; value: string; done: boolean }) {
  return <div className={`rounded-2xl px-4 py-3 ring-1 ${done ? "bg-white ring-[#7b61ff]/15" : "bg-amber-50 ring-amber-200"}`}>
    <p className="text-[10px] font-bold uppercase tracking-wider text-[#86868b]">{label}</p>
    <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">{done && <Check className="size-4 text-[#7b61ff]" />}{value}</p>
  </div>;
}

function CandidateCard({
  candidate,
  references,
  selected,
  onToggle,
  onResearch,
  researching,
  disabled,
}: {
  candidate: SolutionCandidate;
  references: SolutionReference[];
  selected: boolean;
  onToggle: () => void;
  onResearch: () => void;
  researching: boolean;
  disabled: boolean;
}) {
  return <Card className={`min-w-0 gap-0 rounded-2xl transition ${selected ? "bg-[#f4f0ff] ring-2 ring-[#7b61ff]/35" : "bg-white"}`}>
    <CardHeader className="gap-2 border-b border-black/[.05] p-4">
      <div className="flex items-center justify-between gap-2"><Badge variant="outline" className="text-[10px]">{candidate.source === "ai" ? "AI 후보" : "팀 후보"}</Badge><span className="font-mono text-[10px] text-[#86868b]">{references.length} REF</span></div>
      <CardTitle className="break-words text-base leading-5">{candidate.label}</CardTitle>
      <p className="break-words text-xs leading-5 text-[#6e6e73]">{candidate.statement}</p>
    </CardHeader>
    <CardContent className="space-y-3 p-4">
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#7b61ff]">본질 링크</p><p className="mt-1 break-words text-xs leading-5">{candidate.essence_link}</p></div>
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#b55300]">Trade-off</p><p className="mt-1 break-words text-xs leading-5 text-[#6e6e73]">{candidate.tradeoff}</p></div>
      {references.length > 0 ? <div className="space-y-2 border-t border-black/[.06] pt-3">
        {references.map((reference) => <a key={reference.id} href={reference.url} target="_blank" rel="noreferrer" className="block rounded-xl bg-[#f5f5f7] p-2.5 text-xs transition hover:bg-[#ededf2]">
          <span className="flex items-start justify-between gap-2 font-semibold"><span className="break-words">{reference.title}</span><ExternalLink className="mt-0.5 size-3 shrink-0" /></span>
          <span className="mt-1 block break-words leading-5 text-[#6e6e73]">{reference.finding}</span>
          <span className="mt-1 block text-[10px] text-[#86868b]">{reference.publisher}{reference.data_date ? ` · ${reference.data_date}` : ""}</span>
        </a>)}
      </div> : <div className="rounded-xl bg-amber-50 p-2.5 text-xs leading-5 text-amber-800 ring-1 ring-amber-200"><p className="flex items-center gap-1 font-bold"><AlertTriangle className="size-3.5" /> 근거 없음</p><p>선례를 붙여야 합성 재료로 사용할 수 있습니다.</p></div>}
      <div className="grid gap-2">
        {references.length === 0 && <Button variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal rounded-xl py-1.5 text-xs" onClick={onResearch} disabled={disabled}>
          {researching ? <LoaderCircle className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} AI 선례 찾기
        </Button>}
        <button type="button" onClick={onToggle} disabled={disabled} className={`flex min-h-9 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${selected ? "bg-[#7b61ff] text-white" : "bg-[#f2f2f7] hover:bg-[#e8e8ed]"}`}>
          <span>{selected ? "Synthesis 재료로 선택됨" : "Synthesis 재료로 선택"}</span>{selected && <Check className="size-3.5 shrink-0" />}
        </button>
      </div>
    </CardContent>
  </Card>;
}

function CandidateForm({ categoryLabel, value, onChange, onCancel, onSubmit, saving }: {
  categoryLabel: string;
  value: CandidateDraft;
  onChange: (value: CandidateDraft) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  const valid = Object.values(value).every((item) => item.trim());
  return <form onSubmit={onSubmit} className="mt-3 space-y-2 rounded-2xl bg-white p-3 ring-1 ring-[#7b61ff]/20">
    <p className="text-xs font-bold">{categoryLabel} 후보 추가</p>
    <Input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} placeholder="후보 이름" className="h-9 text-xs" />
    <Textarea value={value.statement} onChange={(event) => onChange({ ...value, statement: event.target.value })} placeholder="어떤 방식의 솔루션인가요?" className="min-h-20 text-xs" />
    <Textarea value={value.essence_link} onChange={(event) => onChange({ ...value, essence_link: event.target.value })} placeholder="본질 문제에 왜 유효한가요?" className="min-h-20 text-xs" />
    <Textarea value={value.tradeoff} onChange={(event) => onChange({ ...value, tradeoff: event.target.value })} placeholder="감수할 트레이드오프 한 줄" className="min-h-16 text-xs" />
    <div className="grid grid-cols-2 gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>취소</Button><Button type="submit" size="sm" disabled={!valid || saving}>{saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} 추가</Button></div>
  </form>;
}

function SynthesisCard({ run, candidates, latest }: { run: SolutionSynthesisRun; candidates: SolutionCandidate[]; latest: boolean }) {
  const materialNames = run.input_candidate_ids.map((id) => candidates.find((candidate) => candidate.id === id)?.label).filter(Boolean);
  return <article id={latest ? "latest-solution-synthesis" : undefined} className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-black/[.05] sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#6e4bd8]"><Sparkles className="size-4" /> N+1 Synthesis</p><Badge variant="outline">{run.result.synthesis_possible ? "새 관점 생성" : "도약 보류"}</Badge></div>
    <p className="mt-2 text-xs text-[#86868b]">재료 · {materialNames.join(" + ") || `${run.input_candidate_ids.length}개 후보`}</p>
    {run.result.synthesis_possible && run.result.catalyst ? <div className="mt-4 space-y-4">
      <div className="rounded-2xl bg-[linear-gradient(135deg,#7b61ff,#4f46c7)] p-5 text-white"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/60"><Lightbulb className="size-3.5" /> Provocation</p><p className="mt-2 text-lg font-semibold leading-7">{run.result.catalyst.provocation}</p></div>
      <p className="text-sm leading-6 text-[#6e6e73]">{run.result.catalyst.reframe}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#6e6e73]">{run.result.catalyst.tensions.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
      <p className="border-t border-black/[.06] pt-4 text-sm font-semibold text-[#6e4bd8]">팀 질문 · {run.result.catalyst.discussion_question}</p>
    </div> : <p className="mt-4 rounded-2xl bg-[#f5f5f7] p-4 text-sm leading-6 text-[#6e6e73]">{run.result.refusal_reason || "선택한 후보로 근거 있는 새 관점을 만들지 않았습니다."}</p>}
  </article>;
}

function upsert<T extends { id: string }>(items: T[], next: T) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [...items, next];
  return items.map((item) => item.id === next.id ? next : item);
}
