"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronDown,
  CircleDot,
  Database,
  ExternalLink,
  FileCheck2,
  GitBranch,
  Lightbulb,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignOutButton } from "@/components/auth-button";
import { NewBranchForm } from "@/components/new-branch-form";
import { BranchCard } from "@/components/branch-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  Branch,
  Comment,
  FinalProblemDefinition,
  ProblemEvidence,
  ProblemEvidenceVote,
  ProblemNode,
  ProblemNodeVote,
  ProblemSession,
  Project,
} from "@/lib/types";

const STEPS = [
  { id: 1, label: "표면 포착", detail: "사실과 영향" },
  { id: 2, label: "MECE 발산", detail: "왜?를 가지로" },
  { id: 3, label: "데이터 검증", detail: "발견과 반증" },
  { id: 4, label: "직감 수렴", detail: "사람이 선택" },
  { id: 5, label: "본질 정의", detail: "문서로 남김" },
] as const;

const ROLE_COPY = {
  diverge: { label: "새 가지 촉발", className: "bg-violet-500/10 text-violet-700" },
  support: { label: "가설 지지", className: "bg-emerald-500/10 text-emerald-700" },
  challenge: { label: "가설 반증", className: "bg-amber-500/15 text-amber-800" },
} as const;

type SessionDraft = Pick<
  ProblemSession,
  "topic" | "subject" | "situation" | "surface_problem" | "impact"
>;

const EMPTY_SESSION: SessionDraft = {
  topic: "",
  subject: "",
  situation: "",
  surface_problem: "",
  impact: "",
};

function problemStatement(draft: SessionDraft) {
  const pieces = [draft.subject, draft.situation, draft.surface_problem, draft.impact]
    .map((value) => value.trim())
    .filter(Boolean);
  return pieces.length === 4
    ? `${pieces[0]}가 ${pieces[1]}에서 ${pieces[2]}을 겪고 있으며, 그 결과 ${pieces[3]}이 발생한다.`
    : "누가·상황·문제·영향을 채우면 팀의 표면 문제 문장이 완성됩니다.";
}

export function ProblemSessionWorkspace({
  project,
  currentUserId,
  userEmail,
  initialSession,
  initialBranches,
  initialNodes,
  initialNodeVotes,
  initialEvidence,
  initialEvidenceVotes,
}: {
  project: Project;
  currentUserId: string;
  userEmail: string;
  initialSession: ProblemSession | null;
  initialBranches: Branch[];
  initialNodes: ProblemNode[];
  initialNodeVotes: ProblemNodeVote[];
  initialEvidence: ProblemEvidence[];
  initialEvidenceVotes: ProblemEvidenceVote[];
}) {
  const [session, setSession] = useState<ProblemSession | null>(initialSession);
  const [draft, setDraft] = useState<SessionDraft>(initialSession ?? EMPTY_SESSION);
  const [branches, setBranches] = useState(initialBranches);
  const [nodes, setNodes] = useState(initialNodes);
  const [nodeVotes, setNodeVotes] = useState(initialNodeVotes);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [evidenceVotes, setEvidenceVotes] = useState(initialEvidenceVotes);
  const [savingSession, setSavingSession] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualNodeId, setManualNodeId] = useState<string | null>(null);
  const [manualEvidence, setManualEvidence] = useState({
    title: "",
    publisher: "",
    url: "",
    finding: "",
    data_date: "",
    role: "support" as ProblemEvidence["role"],
  });

  const nodeVoteCounts = useMemo(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const counts = new Map<string, number>();
    nodeVotes.forEach((vote) => {
      if (nodeIds.has(vote.node_id)) counts.set(vote.node_id, (counts.get(vote.node_id) ?? 0) + 1);
    });
    return counts;
  }, [nodeVotes, nodes]);
  const evidenceVoteCounts = useMemo(() => {
    const evidenceIds = new Set(evidence.map((item) => item.id));
    const counts = new Map<string, number>();
    evidenceVotes.forEach((vote) => {
      if (evidenceIds.has(vote.evidence_id)) counts.set(vote.evidence_id, (counts.get(vote.evidence_id) ?? 0) + 1);
    });
    return counts;
  }, [evidenceVotes, evidence]);
  const myNodeVotes = useMemo(
    () => {
      const nodeIds = new Set(nodes.map((node) => node.id));
      return new Set(nodeVotes.filter((vote) => vote.author_id === currentUserId && nodeIds.has(vote.node_id)).map((vote) => vote.node_id));
    },
    [nodeVotes, nodes, currentUserId],
  );
  const myEvidenceVotes = useMemo(
    () => {
      const evidenceIds = new Set(evidence.map((item) => item.id));
      return new Set(evidenceVotes.filter((vote) => vote.author_id === currentUserId && evidenceIds.has(vote.evidence_id)).map((vote) => vote.evidence_id));
    },
    [evidenceVotes, evidence, currentUserId],
  );
  const maxDepth = Math.max(0, ...nodes.map((node) => node.depth));
  const votedNodeIds = new Set(nodeVoteCounts.keys());
  const votedEvidence = evidence.filter((item) => evidenceVoteCounts.has(item.id));
  const evidenceCoveredNodeIds = new Set(votedEvidence.map((item) => item.node_id));
  const uncoveredVotedNodes = nodes.filter(
    (node) => votedNodeIds.has(node.id) && !evidenceCoveredNodeIds.has(node.id),
  );
  const hasDiscoveryEvidence = votedEvidence.some(
    (item) => item.role === "diverge" || item.role === "challenge",
  );
  const readyToFinalize =
    nodeVoteCounts.size > 0 &&
    evidenceVoteCounts.size > 0;
  const finalChecklist = [
    {
      label: "본질 후보를 1개 이상 선택",
      done: nodeVoteCounts.size > 0,
      detail: `${nodeVoteCounts.size}개 선택`,
    },
    {
      label: "데이터 근거를 1개 이상 채택",
      done: evidenceVoteCounts.size > 0,
      detail: `${evidenceVoteCounts.size}개 채택`,
    },
    {
      label: "선택 후보마다 근거 연결",
      done: uncoveredVotedNodes.length === 0 && nodeVoteCounts.size > 0,
      detail: uncoveredVotedNodes.length
        ? `${uncoveredVotedNodes.length}개 후보는 근거 없이 초안에 표시`
        : "모두 연결됨",
      optional: true,
    },
    {
      label: "새 발견·반증 데이터 포함",
      done: hasDiscoveryEvidence,
      detail: hasDiscoveryEvidence ? "포함됨" : "없으면 낮은 신뢰도로 생성",
      optional: true,
    },
  ];

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`problem-session-${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "problem_sessions", filter: `project_id=eq.${project.id}` }, (payload) => {
        if (payload.eventType === "DELETE") return;
        const next = payload.new as ProblemSession;
        setSession(next);
        setDraft({
          topic: next.topic,
          subject: next.subject,
          situation: next.situation,
          surface_problem: next.surface_problem,
          impact: next.impact,
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "problem_nodes", filter: `project_id=eq.${project.id}` }, (payload) => {
        if (payload.eventType === "DELETE") setNodes((items) => items.filter((item) => item.id !== (payload.old as { id: string }).id));
        else setNodes((items) => upsert(items, payload.new as ProblemNode));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "problem_node_votes" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as ProblemNodeVote;
          setNodeVotes((items) => items.filter((item) => !(item.node_id === old.node_id && item.author_id === old.author_id)));
        } else setNodeVotes((items) => upsertVote(items, payload.new as ProblemNodeVote, "node_id"));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "problem_evidence", filter: `project_id=eq.${project.id}` }, (payload) => {
        if (payload.eventType === "DELETE") setEvidence((items) => items.filter((item) => item.id !== (payload.old as { id: string }).id));
        else setEvidence((items) => upsert(items, payload.new as ProblemEvidence));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "problem_evidence_votes" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as ProblemEvidenceVote;
          setEvidenceVotes((items) => items.filter((item) => !(item.evidence_id === old.evidence_id && item.author_id === old.author_id)));
        } else setEvidenceVotes((items) => upsertVote(items, payload.new as ProblemEvidenceVote, "evidence_id"));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "branches", filter: `project_id=eq.${project.id}` }, (payload) => {
        setBranches((items) => upsert(items, { ...(payload.new as Omit<Branch, "comments">), comments: [] }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, (payload) => addComment(payload.new as Comment))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [project.id]);

  function addComment(comment: Comment) {
    setBranches((items) => items.map((branch) => branch.id === comment.branch_id
      ? { ...branch, comments: upsert(branch.comments, comment) }
      : branch));
  }

  async function saveSurface() {
    if (!draft.topic.trim() || !draft.surface_problem.trim()) return;
    setSavingSession(true);
    setError(null);
    const supabase = createClient();
    const now = new Date().toISOString();
    const { data, error: saveError } = await supabase.from("problem_sessions").upsert({
      project_id: project.id,
      ...draft,
      stage: Math.max(session?.stage ?? 1, 1),
      updated_at: now,
    }, { onConflict: "project_id" }).select("*").single();
    setSavingSession(false);
    if (saveError) setError(saveError.message);
    else {
      setSession(data as ProblemSession);
      setNotice("표면 문제를 저장했습니다. 이제 팀의 날것 생각을 모아보세요.");
    }
  }

  async function runAction(action: string, nodeId?: string) {
    setBusy(nodeId ? `${action}:${nodeId}` : action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/problem-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, projectId: project.id, nodeId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ? `${data.error} · ${data.detail}` : data.error);
      if (Array.isArray(data.nodes)) setNodes((items) => data.nodes.reduce((next: ProblemNode[], node: ProblemNode) => upsert(next, node), items));
      if (Array.isArray(data.evidence)) setEvidence((items) => data.evidence.reduce((next: ProblemEvidence[], item: ProblemEvidence) => upsert(next, item), items));
      if (data.definition) {
        setSession((current) => current ? { ...current, stage: 5, final_definition: data.definition } : current);
        window.setTimeout(() => {
          document.getElementById("final-definition")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 0);
      }
      if (action === "finalize") {
        const gapCount = Array.isArray(data.quality_gaps) ? data.quality_gaps.length : 0;
        const synthesisApplied = data.synthesis?.synthesis_possible === true;
        setNotice(synthesisApplied
          ? `Synthesis 재구성을 검증해 Opus 최종 문제정의를 완성했습니다.${gapCount > 0 ? ` 검증 과제 ${gapCount}개를 경계에 표시했습니다.` : ""}`
          : `Synthesis가 무리한 도약을 보류해 선택된 자료만으로 Opus 최종 문제정의를 완성했습니다.${gapCount > 0 ? ` 검증 과제 ${gapCount}개를 표시했습니다.` : ""}`);
      }
      if (data.mece_check) setNotice(`MECE 점검: ${data.mece_check}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  async function toggleNodeVote(nodeId: string) {
    const supabase = createClient();
    if (myNodeVotes.has(nodeId)) {
      await supabase.from("problem_node_votes").delete().eq("node_id", nodeId).eq("author_id", currentUserId);
      setNodeVotes((items) => items.filter((item) => !(item.node_id === nodeId && item.author_id === currentUserId)));
    } else {
      const vote = { node_id: nodeId, author_id: currentUserId, created_at: new Date().toISOString() };
      const { error: voteError } = await supabase.from("problem_node_votes").insert(vote);
      if (!voteError) setNodeVotes((items) => upsertVote(items, vote, "node_id"));
    }
  }

  async function toggleEvidenceVote(evidenceId: string) {
    const supabase = createClient();
    if (myEvidenceVotes.has(evidenceId)) {
      await supabase.from("problem_evidence_votes").delete().eq("evidence_id", evidenceId).eq("author_id", currentUserId);
      setEvidenceVotes((items) => items.filter((item) => !(item.evidence_id === evidenceId && item.author_id === currentUserId)));
    } else {
      const vote = { evidence_id: evidenceId, author_id: currentUserId, created_at: new Date().toISOString() };
      const { error: voteError } = await supabase.from("problem_evidence_votes").insert(vote);
      if (!voteError) setEvidenceVotes((items) => upsertVote(items, vote, "evidence_id"));
    }
  }

  async function addManualEvidence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualNodeId || !manualEvidence.title.trim() || !manualEvidence.finding.trim()) return;
    setBusy(`manual:${manualNodeId}`);
    const supabase = createClient();
    const { data, error: insertError } = await supabase.from("problem_evidence").insert({
      project_id: project.id,
      node_id: manualNodeId,
      author_id: currentUserId,
      source: "human",
      ...manualEvidence,
    }).select("*").single();
    setBusy(null);
    if (insertError) setError(insertError.message);
    else {
      setEvidence((items) => upsert(items, data as ProblemEvidence));
      setManualEvidence({ title: "", publisher: "", url: "", finding: "", data_date: "", role: "support" });
      setManualNodeId(null);
    }
  }

  const finalDefinition = session?.final_definition;
  const activeStage = finalDefinition ? 5 : evidence.length ? 3 : nodes.length ? 2 : 1;

  return (
    <main className="min-h-full min-w-0 flex-1 overflow-x-clip bg-[#f4f1e9] text-[#172019] [overflow-wrap:anywhere]">
      <header className="border-b border-black/10 bg-[#172019] text-white">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-white hover:bg-white/10 hover:text-white" })}>
              <ArrowLeft className="size-4" /> 세션 목록
            </Link>
            <div className="hidden h-5 w-px bg-white/20 sm:block" />
            <span className="hidden truncate text-sm font-medium sm:block">{project.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-white/55 lg:inline">{userEmail}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="overflow-x-auto border-b border-black/10 bg-[#ebe6d9]">
        <div className="mx-auto grid min-w-[700px] w-full max-w-[1500px] grid-cols-5 px-3 sm:px-7">
          {STEPS.map((step) => (
            <div key={step.id} className={`border-l border-black/10 px-2 py-3 last:border-r sm:px-4 ${step.id === activeStage ? "bg-[#d9ff57]" : step.id < activeStage ? "bg-white/40" : "opacity-55"}`}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px]">0{step.id}</span>
                <span className="text-xs font-semibold sm:text-sm">{step.label}</span>
              </div>
              <p className="mt-0.5 hidden text-[11px] text-black/55 md:block">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-7 sm:py-10">
        <section className="mb-8 grid gap-6 border-b border-black/15 pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#456014]">
              <CircleDot className="size-4" /> Live problem definition room
            </div>
            <h1 className="max-w-4xl text-balance text-4xl font-black leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              표면에서 멈추지 말고,<br /><span className="text-[#577d11]">왜의 끝</span>까지 내려갑니다.
            </h1>
          </div>
          <div className="max-w-sm border-l-2 border-[#91c423] pl-4 text-sm leading-6 text-black/65">
            <p className="font-semibold text-black">직감·판단은 인간이.</p>
            <p>리서치·구조화·기록의 노동은 AI가 맡습니다.</p>
          </div>
        </section>

        {(error || notice) && (
          <div className={`mb-6 rounded-none border-l-4 px-4 py-3 text-sm ${error ? "border-red-500 bg-red-50 text-red-800" : "border-[#80ad1a] bg-[#efffc5] text-[#355006]"}`} role={error ? "alert" : "status"}>
            {error ?? notice}
          </div>
        )}

        <section className="mb-10 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
          <Card className="min-w-0 rounded-none border-black/15 bg-[#fffdf7] shadow-none">
            <CardHeader className="border-b border-black/10">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-xl"><Target className="size-5 text-[#6f9818]" /> 1. 표면 문제 포착</CardTitle>
                {session && <Badge variant="outline"><Check className="size-3" /> 저장됨</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <Field label="세션 주제" value={draft.topic} onChange={(value) => setDraft({ ...draft, topic: value })} placeholder="예: 지역 소멸 시대 청년 정착" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="누가" value={draft.subject} onChange={(value) => setDraft({ ...draft, subject: value })} placeholder="문제를 겪는 사람·팀" />
                <Field label="어떤 상황에서" value={draft.situation} onChange={(value) => setDraft({ ...draft, situation: value })} placeholder="문제가 드러나는 구체 상황" />
              </div>
              <Field label="관찰한 표면 문제" value={draft.surface_problem} onChange={(value) => setDraft({ ...draft, surface_problem: value })} placeholder="해석이나 해결책 대신 실제로 벌어진 일을 적으세요" multiline />
              <Field label="결국 잃는 것·영향" value={draft.impact} onChange={(value) => setDraft({ ...draft, impact: value })} placeholder="시간, 비용, 기회, 사람에게 생기는 결과" />
              <div className="border-l-4 border-[#d9ff57] bg-[#172019] p-4 text-white">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Surface statement</p>
                <p className="mt-2 text-sm font-medium leading-6">{problemStatement(draft)}</p>
              </div>
              <Button onClick={saveSurface} disabled={savingSession || !draft.topic.trim() || !draft.surface_problem.trim()} className="bg-[#172019] text-white hover:bg-[#29372b]">
                {savingSession ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
                표면 문제 저장
              </Button>
            </CardContent>
          </Card>

          <Card className="min-w-0 rounded-none border-black/15 bg-[#fffdf7] shadow-none">
            <CardHeader className="border-b border-black/10">
              <CardTitle className="flex items-center gap-2 text-xl"><UsersRound className="size-5 text-[#6f9818]" /> 팀의 날것 생각</CardTitle>
              <p className="text-sm text-black/55">먼저 각자 적고, 맥락을 붙인 다음 말합니다. 모든 입력은 실시간으로 함께 보입니다.</p>
            </CardHeader>
            <CardContent className="pt-5">
              <NewBranchForm projectId={project.id} onCreated={(branch) => setBranches((items) => upsert(items, branch))} placeholder="아직 정리되지 않은 관찰·의심·경험을 한 줄로…" submitLabel="공용 보드에 올리기" />
              <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {branches.length === 0 ? <Empty copy="팀원이 첫 생각을 올리면 여기서 함께 발전시킬 수 있습니다." /> : branches.map((branch, index) => (
                  <BranchCard key={branch.id} branch={branch} index={index} currentUserId={currentUserId} selected={false} onToggleSelect={() => undefined} selectionMode={false}
                    onCommentCreated={addComment}
                    onBranchDeleted={(id) => setBranches((items) => items.filter((item) => item.id !== id))}
                    onCommentDeleted={(id) => setBranches((items) => items.map((item) => ({ ...item, comments: item.comments.filter((comment) => comment.id !== id) })))} />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-10 border-t-2 border-black pt-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-[#577d11]">02 / DIVERGE</p>
              <h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">왜?를 MECE 가지로 펼치기</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">AI가 원인 가설을 펼치면, 사람은 본질에 가깝다고 느끼는 가지만 선택합니다. 선택되지 않은 가지를 AI가 몰래 합성하지 않습니다.</p>
            </div>
            <Button onClick={() => runAction("generate_mece")} disabled={!session?.surface_problem || busy !== null} className="bg-[#d9ff57] text-black hover:bg-[#c8ef45]">
              {busy === "generate_mece" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {nodes.length ? "다른 MECE 가설 펼치기" : "MECE 가설 펼치기"}
            </Button>
          </div>

          {nodes.length === 0 ? <Empty copy="표면 문제를 저장한 뒤 AI가 MECE 원인 가설을 펼치게 하세요." /> : (
            <div className="space-y-8">
              {Array.from({ length: maxDepth }, (_, index) => index + 1).map((depth) => {
                const depthNodes = nodes.filter((node) => node.depth === depth);
                if (!depthNodes.length) return null;
                return (
                  <div key={depth}>
                    <div className="mb-3 flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-[#172019] font-mono text-xs text-white">{depth}</span><span className="text-sm font-bold">{depth === 1 ? "표면 문제의 원인 지도" : `왜? ${depth}단계 — 더 깊은 원인`}</span><div className="h-px flex-1 bg-black/15" /></div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {depthNodes.map((node) => {
                        const selected = myNodeVotes.has(node.id);
                        const nodeEvidence = evidence.filter((item) => item.node_id === node.id);
                        return (
                          <Card key={node.id} className={`min-w-0 rounded-none shadow-none transition-colors ${selected ? "border-[#79a814] bg-[#f5ffd9]" : "border-black/15 bg-[#fffdf7]"}`}>
                            <CardHeader className="min-w-0 space-y-3 border-b border-black/10">
                              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><Badge variant="outline" className="h-auto max-w-full whitespace-normal rounded-none text-left leading-5">{node.axis}</Badge><span className="shrink-0 font-mono text-[10px] text-black/40">{node.source === "ai" ? "AI HYPOTHESIS" : "HUMAN"}</span></div>
                              <CardTitle className="min-w-0 break-words text-xl leading-tight">{node.label}</CardTitle>
                              <p className="min-w-0 break-words text-sm leading-6 text-black/70">{node.statement}</p>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-4">
                              <div className="bg-black/[0.04] p-3 text-sm"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-black/45">다음 Why</p><p className="font-medium">{node.why_question}</p></div>
                              <button onClick={() => toggleNodeVote(node.id)} className={`flex w-full min-w-0 items-center justify-between gap-2 border px-3 py-2 text-left text-sm font-semibold transition-colors ${selected ? "border-[#6f9818] bg-[#d9ff57]" : "border-black/20 hover:border-black"}`}>
                                <span className="min-w-0 break-words">{selected ? "내 직감: 본질 후보로 선택됨" : "내 직감으로 본질 후보 선택"}</span><span className="flex shrink-0 items-center gap-1 font-mono text-xs"><UsersRound className="size-3.5" />{nodeVoteCounts.get(node.id) ?? 0}</span>
                              </button>
                              <div className="grid grid-cols-2 gap-2">
                                <Button className="h-auto min-h-8 whitespace-normal py-1.5 text-center leading-4" variant="outline" size="sm" onClick={() => runAction("expand_node", node.id)} disabled={busy !== null || node.depth >= 5}>
                                  {busy === `expand_node:${node.id}` ? <LoaderCircle className="size-4 animate-spin" /> : <GitBranch className="size-4" />} 한 단계 더 파기
                                </Button>
                                <Button className="h-auto min-h-8 whitespace-normal py-1.5 text-center leading-4" variant="outline" size="sm" onClick={() => runAction("research_node", node.id)} disabled={busy !== null}>
                                  {busy === `research_node:${node.id}` ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />} 데이터 찾기
                                </Button>
                              </div>

                              {nodeEvidence.length > 0 && <div className="space-y-2 border-t border-black/10 pt-4">
                                <p className="flex items-center gap-1.5 text-xs font-bold"><Database className="size-4 text-[#6f9818]" /> 가지에 붙은 근거 {nodeEvidence.length}</p>
                                {nodeEvidence.map((item) => (
                                  <EvidenceCard key={item.id} item={item} selected={myEvidenceVotes.has(item.id)} votes={evidenceVoteCounts.get(item.id) ?? 0} onToggle={() => toggleEvidenceVote(item.id)} />
                                ))}
                              </div>}

                              {manualNodeId === node.id ? (
                                <ManualEvidenceForm value={manualEvidence} onChange={setManualEvidence} onCancel={() => setManualNodeId(null)} onSubmit={addManualEvidence} saving={busy === `manual:${node.id}`} />
                              ) : (
                                <Button variant="ghost" size="sm" className="h-auto min-h-8 w-full whitespace-normal py-1.5 text-center leading-4" onClick={() => setManualNodeId(node.id)}><Plus className="size-4" /> 내가 찾은 데이터 직접 붙이기</Button>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-5 border-t-2 border-black pt-6 lg:grid-cols-[.75fr_1.25fr]">
          <div>
            <p className="font-mono text-xs text-[#577d11]">04—05 / SYNTHESIZE → CONVERGE</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">팀의 판단을<br />하나의 정의로</h2>
            <div className="mt-5 grid grid-cols-2 border border-black/15 bg-white/55 text-xs">
              <div className="min-w-0 border-r border-black/15 p-3">
                <p className="font-mono font-bold text-[#577d11]">01 · SYNTHESIS</p>
                <p className="mt-1 break-words leading-5 text-black/60">선택과 근거 사이에서 N+1 문제 관점을 찾습니다.</p>
              </div>
              <div className="min-w-0 p-3">
                <p className="font-mono font-bold text-[#577d11]">02 · OPUS FINAL</p>
                <p className="mt-1 break-words leading-5 text-black/60">근거가 지지하는 해석만 최종 문서로 편집합니다.</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {finalChecklist.map((item) => (
                <div key={item.label} className={`border px-3 py-3 text-sm ${item.done ? "border-[#7ca718] bg-[#f3ffd3]" : item.optional ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"}`}>
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.done ? "bg-[#6f9818] text-white" : "bg-black/10 text-black/55"}`}>{item.done ? "✓" : "!"}</span>
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{item.label}{item.optional ? " · 권장" : " · 필수"}</p>
                      <p className="mt-0.5 break-words text-xs text-black/55">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={() => runAction("finalize")} disabled={busy !== null || !readyToFinalize} aria-busy={busy === "finalize"} className="mt-4 h-auto min-h-10 w-full whitespace-normal bg-[#172019] py-2 text-center leading-5 text-white hover:bg-[#29372b]">
              {busy === "finalize" ? <LoaderCircle className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
              {busy === "finalize" ? "Synthesis 후 Opus 보고서 생성 중…" : <>문제정의 문서 완성하기 <ArrowRight className="size-4" /></>}
            </Button>
            {!readyToFinalize && <p className="mt-2 text-xs leading-5 text-red-700">위의 빨간색 필수 항목 2개를 완료하면 버튼이 활성화됩니다.</p>}
            {readyToFinalize && (uncoveredVotedNodes.length > 0 || !hasDiscoveryEvidence) && <p className="mt-2 text-xs leading-5 text-amber-800">권장 항목이 남아 있어도 초안을 만들 수 있습니다. 부족한 근거는 문서에 검증 과제로 표시됩니다.</p>}
            {error && <p role="alert" className="mt-3 break-words border border-red-300 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">{error}</p>}
          </div>
          {finalDefinition ? <FinalDefinitionCard definition={finalDefinition} topic={session?.topic ?? project.name} /> : (
            <div className="flex min-h-72 items-center justify-center border border-dashed border-black/25 bg-white/35 p-8 text-center">
              <div><BookOpenCheck className="mx-auto size-9 text-black/30" /><p className="mt-3 font-semibold">아직 최종 문제정의가 없습니다.</p><p className="mt-1 text-sm text-black/50">팀의 본질 선택과 채택 근거가 모이면 이곳에 읽기 쉬운 문서가 남습니다.</p></div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function upsert<T extends { id: string }>(items: T[], next: T) {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [...items, next];
  return items.map((item) => item.id === next.id ? next : item);
}

function upsertVote<T extends { author_id: string }>(items: T[], next: T, key: keyof T) {
  const index = items.findIndex((item) => item[key] === next[key] && item.author_id === next.author_id);
  if (index < 0) return [...items, next];
  return items.map((item, itemIndex) => itemIndex === index ? next : item);
}

function Field({ label, value, onChange, placeholder, multiline = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <label className="block space-y-1.5 text-sm font-semibold"><span>{label}</span>{multiline ? <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="rounded-none bg-white" /> : <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="rounded-none bg-white" />}</label>;
}

function Empty({ copy }: { copy: string }) {
  return <div className="border border-dashed border-black/20 bg-white/30 px-6 py-10 text-center text-sm text-black/50"><Lightbulb className="mx-auto mb-2 size-6" />{copy}</div>;
}

function EvidenceCard({ item, selected, votes, onToggle }: { item: ProblemEvidence; selected: boolean; votes: number; onToggle: () => void }) {
  const role = ROLE_COPY[item.role];
  return <div className={`min-w-0 border p-3 text-sm ${selected ? "border-[#78a513] bg-[#f4ffd5]" : "border-black/10 bg-white"}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className={`px-2 py-0.5 text-[10px] font-bold ${role.className}`}>{role.label}</span><span className="text-[10px] text-black/45">{item.source === "web" ? "AI 검색 · 실제 URL 검증" : "팀원 직접 입력"}</span></div>
    <p className="min-w-0 break-words font-semibold leading-5">{item.title}</p>
    <p className="mt-1 text-xs text-black/50">{item.publisher}{item.data_date ? ` · ${item.data_date}` : ""}</p>
    <p className="mt-2 min-w-0 break-words leading-5 text-black/70">{item.finding}</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all text-xs font-semibold text-[#577d11] hover:underline">원문 확인 <ExternalLink className="size-3 shrink-0" /></a> : <span className="text-xs text-black/35">현장 자료</span>}
      <button onClick={onToggle} className={`shrink-0 whitespace-normal border px-2 py-1 text-xs font-semibold ${selected ? "border-[#6f9818] bg-[#d9ff57]" : "border-black/15"}`}>{selected ? "근거 채택됨" : "근거 채택"} · {votes}</button>
    </div>
  </div>;
}

function ManualEvidenceForm({ value, onChange, onCancel, onSubmit, saving }: { value: { title: string; publisher: string; url: string; finding: string; data_date: string; role: ProblemEvidence["role"] }; onChange: (value: { title: string; publisher: string; url: string; finding: string; data_date: string; role: ProblemEvidence["role"] }) => void; onCancel: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  return <form onSubmit={onSubmit} className="space-y-2 border-t border-black/10 pt-4">
    <p className="text-xs font-bold">팀원이 직접 찾은 데이터</p>
    <select aria-label="근거 역할" value={value.role} onChange={(event) => onChange({ ...value, role: event.target.value as ProblemEvidence["role"] })} className="h-9 w-full border border-black/15 bg-white px-2 text-sm"><option value="support">가설 지지</option><option value="challenge">가설 반증</option><option value="diverge">새 가지 촉발</option></select>
    <Input aria-label="자료명" value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} placeholder="자료명 *" className="rounded-none" />
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Input aria-label="기관 또는 출처" value={value.publisher} onChange={(event) => onChange({ ...value, publisher: event.target.value })} placeholder="기관·출처" className="min-w-0 rounded-none" /><Input aria-label="자료 기준 시점" value={value.data_date} onChange={(event) => onChange({ ...value, data_date: event.target.value })} placeholder="기준 시점" className="min-w-0 rounded-none" /></div>
    <Input aria-label="원문 URL" type="url" value={value.url} onChange={(event) => onChange({ ...value, url: event.target.value })} placeholder="원문 URL (선택)" className="rounded-none" />
    <Textarea aria-label="데이터가 보여주는 사실과 한계" value={value.finding} onChange={(event) => onChange({ ...value, finding: event.target.value })} placeholder="이 데이터가 보여주는 사실과 한계 *" rows={3} className="rounded-none" />
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>취소</Button><Button type="submit" size="sm" disabled={saving || !value.title.trim() || !value.finding.trim()}>{saving && <LoaderCircle className="size-4 animate-spin" />}근거 저장</Button></div>
  </form>;
}

function FinalDefinitionCard({ definition, topic }: { definition: FinalProblemDefinition; topic: string }) {
  return <article id="final-definition" className="min-w-0 scroll-mt-6 border-2 border-[#172019] bg-[#fffdf7]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#172019] bg-[#d9ff57] px-5 py-3"><span className="min-w-0 break-words font-mono text-xs font-bold">FINAL PROBLEM DEFINITION</span><Badge className="shrink-0 bg-[#172019] text-white">신뢰도 {definition.confidence}</Badge></div>
    <div className="min-w-0 p-5 sm:p-8">
      <p className="break-words text-xs font-bold uppercase tracking-[0.18em] text-[#577d11]">{topic}</p>
      <h3 className="mt-3 break-words text-3xl font-black leading-tight tracking-[-0.04em] sm:text-4xl">{definition.headline}</h3>
      <blockquote className="mt-6 break-words border-l-4 border-[#d9ff57] bg-[#172019] p-5 text-lg font-semibold leading-8 text-white">{definition.statement}</blockquote>
      {definition.synthesis && <section className="mt-6 min-w-0 border border-[#7ca718] bg-[#f3ffd3] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#46640c]"><Sparkles className="size-4" /> Synthesis 중간 재구성</p>
          <Badge variant="outline" className="h-auto max-w-full whitespace-normal rounded-none border-[#7ca718] text-[10px]">{definition.synthesis.synthesis_possible ? "최종 정의에 검증 반영" : "도약 보류"}</Badge>
        </div>
        {definition.synthesis.synthesis_possible && definition.synthesis.catalyst ? <div className="mt-3 min-w-0 space-y-3">
          <p className="break-words font-semibold leading-6">{definition.synthesis.catalyst.provocation}</p>
          <p className="break-words text-sm leading-6 text-black/65">{definition.synthesis.catalyst.reframe}</p>
          {definition.synthesis.catalyst.tensions.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-black/60">{definition.synthesis.catalyst.tensions.map((item, index) => <li key={`${item}-${index}`} className="break-words">{item}</li>)}</ul>}
          <p className="break-words border-t border-[#7ca718]/35 pt-3 text-xs font-semibold leading-5 text-[#46640c]">검토 질문 · {definition.synthesis.catalyst.discussion_question}</p>
        </div> : <p className="mt-3 break-words text-sm leading-6 text-black/65">{definition.synthesis.refusal_reason || "근거 있는 추가 재구성을 만들지 않고 선택된 판단을 유지했습니다."}</p>}
      </section>}
      <div className="mt-7 grid gap-6 sm:grid-cols-2">
        <section><p className="text-xs font-bold uppercase tracking-wider text-black/45">선택된 본질 원인</p><p className="mt-2 font-semibold leading-6">{definition.root_cause}</p></section>
        <section><p className="text-xs font-bold uppercase tracking-wider text-black/45">데이터가 새로 드러낸 것</p><p className="mt-2 leading-6">{definition.newly_discovered || "추가 검증 필요"}</p></section>
      </div>
      <section className="mt-7"><p className="text-xs font-bold uppercase tracking-wider text-black/45">표면 → 본질 Why chain</p><ol className="mt-3 space-y-2">{definition.why_chain.map((item, index) => <li key={`${item}-${index}`} className="flex min-w-0 gap-3 text-sm"><span className="shrink-0 font-mono font-bold text-[#6f9818]">0{index + 1}</span><span className="min-w-0 break-words">{item}</span></li>)}</ol></section>
      <section className="mt-7"><p className="text-xs font-bold uppercase tracking-wider text-black/45">채택한 데이터 근거</p><ul className="mt-3 space-y-2">{definition.evidence_summary.map((item, index) => <li key={`${item}-${index}`} className="flex min-w-0 gap-2 break-words text-sm leading-6"><Database className="mt-1 size-4 shrink-0 text-[#6f9818]" />{item}</li>)}</ul></section>
      <details className="mt-7 border-t border-black/10 pt-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">이번 정의의 경계 <ChevronDown className="size-4" /></summary><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-black/60">{definition.boundaries.map((item) => <li key={item}>{item}</li>)}</ul></details>
    </div>
  </article>;
}
