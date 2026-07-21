import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createFinalDefinition,
  expandProblemNode,
  generateMeceCandidates,
  researchProblemNode,
} from "@/lib/problem-session-engine";
import { synthesizeProblemDefinition } from "@/lib/synthesis-pipeline";
import type {
  Branch,
  ProblemEvidence,
  ProblemNode,
  ProblemSession,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Action = "generate_mece" | "expand_node" | "research_node" | "finalize";
type Body = { action?: Action; projectId?: string; nodeId?: string };

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

  const { data: membership } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("project_id", body.projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return Response.json({ error: "프로젝트 권한이 없습니다." }, { status: 403 });

  const [{ data: sessionData }, { data: branchData }, { data: stageCommentData }] = await Promise.all([
    supabase.from("problem_sessions").select("*").eq("project_id", body.projectId).maybeSingle(),
    supabase
      .from("branches")
      .select("id, project_id, author_id, idea, created_at, comments(id, branch_id, author_id, body, created_at)")
      .eq("project_id", body.projectId)
      .order("created_at"),
    supabase
      .from("stage_comments")
      .select("stage, body")
      .eq("project_id", body.projectId)
      .order("created_at"),
  ]);
  const session = sessionData as ProblemSession | null;
  if (!session?.surface_problem.trim()) {
    return Response.json({ error: "먼저 표면 문제를 작성해 주세요." }, { status: 400 });
  }
  const branches = (branchData ?? []).map((branch) => ({
    ...branch,
    comments: branch.comments ?? [],
  })) as Branch[];
  const humanComments = (...stages: number[]) => (stageCommentData ?? [])
    .filter((comment) => stages.includes(comment.stage))
    .map((comment) => `[${comment.stage}단계] ${comment.body as string}`);
  const anthropic = new Anthropic();
  console.info("[api/problem-session] action started", {
    action: body.action,
    projectId: body.projectId,
  });

  try {
    if (body.action === "generate_mece") {
      const result = await generateMeceCandidates({ anthropic, session, branches, humanComments: humanComments(1) });
      if (result.candidates.length === 0) throw new Error("MECE 문제 가지를 만들지 못했습니다.");
      const { data, error } = await supabase.from("problem_nodes").insert(
        result.candidates.map((candidate) => ({
          project_id: body.projectId,
          parent_id: null,
          author_id: user.id,
          source: "ai",
          depth: 1,
          axis: result.axis,
          ...candidate,
        })),
      ).select("*");
      if (error) throw new Error(`문제 가지 저장 실패: ${error.message}`);
      await supabase.from("problem_sessions").update({ stage: 2, updated_at: new Date().toISOString() }).eq("project_id", body.projectId);
      return Response.json({ nodes: data, mece_check: result.meceCheck });
    }

    if (body.action === "expand_node") {
      if (!body.nodeId) return Response.json({ error: "파고들 문제 가지가 필요합니다." }, { status: 400 });
      const [{ data: parentData }, { data: siblingData }] = await Promise.all([
        supabase.from("problem_nodes").select("*").eq("project_id", body.projectId).eq("id", body.nodeId).maybeSingle(),
        supabase.from("problem_nodes").select("*").eq("project_id", body.projectId),
      ]);
      const parent = parentData as ProblemNode | null;
      if (!parent) return Response.json({ error: "문제 가지를 찾지 못했습니다." }, { status: 404 });
      if (parent.depth >= 5) return Response.json({ error: "최대 5단계까지 파고들 수 있습니다." }, { status: 400 });
      const result = await expandProblemNode({
        anthropic,
        session,
        parent,
        siblings: (siblingData ?? []) as ProblemNode[],
        branches,
        humanComments: humanComments(1, 2),
      });
      const { data, error } = await supabase.from("problem_nodes").insert(
        result.candidates.map((candidate) => ({
          project_id: body.projectId,
          parent_id: parent.id,
          author_id: user.id,
          source: "ai",
          depth: parent.depth + 1,
          axis: result.axis,
          ...candidate,
        })),
      ).select("*");
      if (error) throw new Error(`하위 문제 저장 실패: ${error.message}`);
      return Response.json({ nodes: data, mece_check: result.meceCheck });
    }

    if (body.action === "research_node") {
      if (!body.nodeId) return Response.json({ error: "근거를 찾을 문제 가지가 필요합니다." }, { status: 400 });
      const { data } = await supabase.from("problem_nodes").select("*").eq("project_id", body.projectId).eq("id", body.nodeId).maybeSingle();
      const node = data as ProblemNode | null;
      if (!node) return Response.json({ error: "문제 가지를 찾지 못했습니다." }, { status: 404 });
      const researched = await researchProblemNode({ anthropic, session, node, humanComments: humanComments(2, 3) });
      if (researched.length === 0) {
        return Response.json({ error: "검증 가능한 공식 출처를 찾지 못했습니다. 직접 근거를 추가해 주세요." }, { status: 404 });
      }
      const { data: inserted, error } = await supabase.from("problem_evidence").insert(
        researched.map((evidence) => ({
          project_id: body.projectId,
          node_id: node.id,
          author_id: user.id,
          source: "web",
          ...evidence,
        })),
      ).select("*");
      if (error) throw new Error(`근거 저장 실패: ${error.message}`);
      await supabase.from("problem_sessions").update({ stage: 3, updated_at: new Date().toISOString() }).eq("project_id", body.projectId);
      return Response.json({ evidence: inserted });
    }

    if (body.action === "finalize") {
      const [{ data: nodes }, { data: nodeVotes }, { data: evidence }, { data: evidenceVotes }] = await Promise.all([
        supabase.from("problem_nodes").select("*").eq("project_id", body.projectId),
        supabase.from("problem_node_votes").select("node_id, author_id"),
        supabase.from("problem_evidence").select("*").eq("project_id", body.projectId),
        supabase.from("problem_evidence_votes").select("evidence_id, author_id"),
      ]);
      const nodeVoteCount = new Map<string, number>();
      for (const vote of nodeVotes ?? []) nodeVoteCount.set(vote.node_id, (nodeVoteCount.get(vote.node_id) ?? 0) + 1);
      const evidenceVoteCount = new Map<string, number>();
      for (const vote of evidenceVotes ?? []) evidenceVoteCount.set(vote.evidence_id, (evidenceVoteCount.get(vote.evidence_id) ?? 0) + 1);
      const selectedNodes = ((nodes ?? []) as ProblemNode[])
        .filter((node) => nodeVoteCount.has(node.id))
        .map((node) => ({ ...node, vote_count: nodeVoteCount.get(node.id)! }));
      const selectedEvidence = ((evidence ?? []) as ProblemEvidence[])
        .filter((item) => evidenceVoteCount.has(item.id))
        .map((item) => ({ ...item, vote_count: evidenceVoteCount.get(item.id)! }));
      if (selectedNodes.length === 0) return Response.json({ error: "팀이 본질 후보를 하나 이상 선택해야 합니다." }, { status: 400 });
      if (selectedEvidence.length === 0) return Response.json({ error: "팀이 데이터 근거를 하나 이상 채택해야 합니다." }, { status: 400 });
      const coveredNodeIds = new Set(selectedEvidence.map((item) => item.node_id));
      const uncoveredNodes = selectedNodes.filter((node) => !coveredNodeIds.has(node.id));
      const qualityGaps = [
        ...(uncoveredNodes.length > 0
          ? [`근거가 아직 없는 본질 후보: ${uncoveredNodes.map((node) => node.label).join(", ")}`]
          : []),
        ...(!selectedEvidence.some((item) => item.role === "diverge" || item.role === "challenge")
          ? ["새 문제를 발견하거나 기존 가설을 반증한 데이터가 아직 없음"]
          : []),
      ];
      console.info("[api/problem-session] finalize materials ready", {
        projectId: body.projectId,
        selectedNodeCount: selectedNodes.length,
        selectedEvidenceCount: selectedEvidence.length,
        qualityGapCount: qualityGaps.length,
      });
      const synthesis = await synthesizeProblemDefinition({
        anthropic,
        session,
        selectedNodes,
        selectedEvidence,
        qualityGaps,
        humanComments: humanComments(3, 4, 5),
      });
      console.info("[api/problem-session] finalize synthesis completed", {
        projectId: body.projectId,
        synthesisPossible: synthesis.synthesis_possible,
        model: synthesis.model,
      });
      const definition = await createFinalDefinition({
        anthropic,
        session,
        branches,
        selectedNodes,
        selectedEvidence,
        qualityGaps,
        synthesis,
        humanComments: humanComments(3, 4, 5),
      });
      const { error } = await supabase.from("problem_sessions").update({
        stage: 5,
        final_definition: definition,
        completed_at: definition.completed_at,
        updated_at: definition.completed_at,
      }).eq("project_id", body.projectId);
      if (error) throw new Error(`최종 문제정의 저장 실패: ${error.message}`);
      console.info("[api/problem-session] finalize completed", {
        projectId: body.projectId,
        confidence: definition.confidence,
      });
      return Response.json({ definition, quality_gaps: qualityGaps, synthesis });
    }

    return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
  } catch (cause) {
    console.error("[api/problem-session] action failed", body.action, cause);
    return Response.json({
      error: "현재 단계를 처리하지 못했습니다.",
      detail: cause instanceof Error ? cause.message : String(cause),
    }, { status: 502 });
  }
}
