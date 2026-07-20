import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  generateSolutionCandidates,
  researchSolutionReferences,
} from "@/lib/solution-engine";
import { synthesizeDrafts, type PipelineBranchInput } from "@/lib/synthesis-pipeline";
import type {
  CombinationCandidate,
  FinalProblemDefinition,
  PipelineDimension,
  ProblemEvidence,
  ProblemSession,
  SolutionCandidate,
  SolutionReference,
  SolutionSynthesis,
} from "@/lib/types";
import { SOLUTION_CATEGORIES } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Action = "generate" | "research" | "synthesize";
type Body = { action?: Action; projectId?: string; candidateIds?: string[] };

function validCandidateIds(value: unknown, minimum = 1) {
  return Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= 5 &&
    value.every((item) => typeof item === "string");
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured || !process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "서버 환경변수가 설정되지 않았습니다." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.action || typeof body.projectId !== "string") {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const [{ data: membership }, { data: sessionData }] = await Promise.all([
    supabase.from("project_members").select("project_id").eq("project_id", body.projectId).eq("user_id", user.id).maybeSingle(),
    supabase.from("problem_sessions").select("*").eq("project_id", body.projectId).maybeSingle(),
  ]);
  if (!membership) return Response.json({ error: "프로젝트 권한이 없습니다." }, { status: 403 });
  const session = sessionData as ProblemSession | null;
  const definition = session?.final_definition as FinalProblemDefinition | null;
  if (!session?.completed_at || !definition?.statement?.trim()) {
    return Response.json({ error: "본질 문제정의를 먼저 완료해야 솔루션을 펼칠 수 있습니다." }, { status: 409 });
  }

  const anthropic = new Anthropic();
  try {
    if (body.action === "generate") {
      const [{ data: evidenceData }, { data: voteData }] = await Promise.all([
        supabase.from("problem_evidence").select("*").eq("project_id", body.projectId),
        supabase.from("problem_evidence_votes").select("evidence_id"),
      ]);
      const votedEvidenceIds = new Set((voteData ?? []).map((vote) => vote.evidence_id));
      const adoptedEvidence = ((evidenceData ?? []) as ProblemEvidence[]).filter((item) => votedEvidenceIds.has(item.id));
      const generated = await generateSolutionCandidates({ anthropic, definition, evidence: adoptedEvidence });
      const { data: candidateData, error: candidateError } = await supabase.from("solution_candidates").insert(
        generated.candidates.map((candidate) => ({
          project_id: body.projectId,
          author_id: user.id,
          source: "ai",
          ...candidate,
        })),
      ).select("*");
      if (candidateError) throw new Error(`솔루션 후보 저장 실패: ${candidateError.message}`);
      const candidates = (candidateData ?? []) as SolutionCandidate[];

      let references: SolutionReference[] = [];
      let referenceWarning: string | null = null;
      try {
        const researched = await researchSolutionReferences({ anthropic, definition, candidates });
        if (researched.length > 0) {
          const { data, error } = await supabase.from("solution_references").insert(
            researched.map((reference) => ({
              project_id: body.projectId,
              author_id: user.id,
              source: "web",
              ...reference,
            })),
          ).select("*");
          if (error) throw new Error(error.message);
          references = (data ?? []) as SolutionReference[];
        }
        if (references.length === 0) referenceWarning = "검증 가능한 선례를 찾지 못했습니다. 후보별 검색을 다시 시도해 주세요.";
      } catch (cause) {
        referenceWarning = cause instanceof Error ? cause.message : "선례 검색에 실패했습니다.";
      }
      return Response.json({ candidates, references, reference_warning: referenceWarning, model: generated.model });
    }

    if (body.action === "research") {
      if (!validCandidateIds(body.candidateIds)) {
        return Response.json({ error: "선례를 찾을 후보를 선택해 주세요." }, { status: 400 });
      }
      const ids = [...new Set(body.candidateIds)];
      const { data } = await supabase.from("solution_candidates").select("*").eq("project_id", body.projectId).in("id", ids);
      const candidates = (data ?? []) as SolutionCandidate[];
      if (candidates.length !== ids.length) return Response.json({ error: "후보를 찾지 못했습니다." }, { status: 404 });
      const researched = await researchSolutionReferences({ anthropic, definition, candidates });
      if (researched.length === 0) return Response.json({ error: "검증 가능한 실제 선례를 찾지 못했습니다." }, { status: 404 });
      const { data: inserted, error } = await supabase.from("solution_references").insert(
        researched.map((reference) => ({
          project_id: body.projectId,
          author_id: user.id,
          source: "web",
          ...reference,
        })),
      ).select("*");
      if (error) throw new Error(`선례 저장 실패: ${error.message}`);
      return Response.json({ references: inserted });
    }

    if (body.action === "synthesize") {
      if (!validCandidateIds(body.candidateIds, 2)) {
        return Response.json({ error: "서로 다른 후보를 2~5개 선택해 주세요." }, { status: 400 });
      }
      const ids = [...new Set(body.candidateIds)];
      if (ids.length < 2) return Response.json({ error: "서로 다른 후보가 2개 이상 필요합니다." }, { status: 400 });
      const [{ data: candidateData }, { data: referenceData }] = await Promise.all([
        supabase.from("solution_candidates").select("*").eq("project_id", body.projectId).in("id", ids),
        supabase.from("solution_references").select("*").eq("project_id", body.projectId).in("candidate_id", ids),
      ]);
      const candidates = (candidateData ?? []) as SolutionCandidate[];
      const references = (referenceData ?? []) as SolutionReference[];
      if (candidates.length !== ids.length) return Response.json({ error: "다른 프로젝트의 후보는 합성할 수 없습니다." }, { status: 403 });
      const missingEvidence = candidates.filter((candidate) => !references.some((item) => item.candidate_id === candidate.id));
      if (missingEvidence.length > 0) {
        return Response.json({ error: `근거가 없는 후보는 합성할 수 없습니다: ${missingEvidence.map((item) => item.label).join(", ")}` }, { status: 409 });
      }

      const branches: PipelineBranchInput[] = candidates.map((candidate) => ({
        id: candidate.id,
        idea: `${candidate.label}\n${candidate.statement}\n본질 연결: ${candidate.essence_link}\n트레이드오프: ${candidate.tradeoff}`,
        comments: references.filter((item) => item.candidate_id === candidate.id).map((item) => ({ id: item.id, body: `${item.publisher} · ${item.finding}` })),
      }));
      const dimensions: PipelineDimension[] = SOLUTION_CATEGORIES.flatMap((category) => {
        const branchIds = candidates.filter((candidate) => candidate.category === category.key).map((candidate) => candidate.id);
        return branchIds.length > 0 ? [{ id: `solution-${category.key}`, label: category.label, description: category.hint, branch_ids: branchIds }] : [];
      });
      const combination: CombinationCandidate = {
        id: `solution-${crypto.randomUUID()}`,
        branch_ids: ids,
        shared_dimension: definition.root_cause || definition.statement,
        tension: "서로 다른 솔루션 계열의 작동 원리와 트레이드오프",
        rationale: "같은 본질 문제를 다른 계열에서 다루는 후보 사이의 생산적 반대를 합성한다.",
      };
      const response = await synthesizeDrafts({
        anthropic,
        branches,
        dimensions,
        combinations: [combination],
        selectedCommentIds: references.map((item) => item.id),
      });
      const pipelineResult = response.results[0];
      if (!pipelineResult) throw new Error("N+1 합성 결과가 없습니다.");
      const result: SolutionSynthesis = {
        synthesis_possible: pipelineResult.synthesis_possible,
        catalyst: pipelineResult.catalyst,
        contribution: pipelineResult.contribution,
        refusal_reason: pipelineResult.refusal_reason,
        model: response.model,
      };
      const { data: run, error } = await supabase.from("solution_syntheses").insert({
        project_id: body.projectId,
        author_id: user.id,
        input_candidate_ids: ids,
        result,
      }).select("*").single();
      if (error) throw new Error(`합성 결과 저장 실패: ${error.message}`);
      return Response.json({ synthesis: run });
    }

    return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
  } catch (cause) {
    console.error("[api/solutions] action failed", body.action, cause);
    return Response.json({
      error: "솔루션 단계를 처리하지 못했습니다.",
      detail: cause instanceof Error ? cause.message : String(cause),
    }, { status: 502 });
  }
}
