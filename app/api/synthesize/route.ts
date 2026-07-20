import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  extractDimensions,
  generateCombinations,
  synthesizeDrafts,
  upgradeSynthesis,
  type PipelineBranchInput,
} from "@/lib/synthesis-pipeline";
import type {
  CombinationCandidate,
  PipelineDimension,
  PipelineSynthesis,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type PipelineAction =
  | "extract_dimensions"
  | "generate_combinations"
  | "synthesize_combinations"
  | "upgrade_synthesis";

type SynthesizeBody = {
  action?: PipelineAction;
  pin?: string;
  projectId?: string;
  branchIds?: string[];
  dimensions?: PipelineDimension[];
  combinations?: CombinationCandidate[];
  combination?: CombinationCandidate;
  previousX?: string;
  selectedCommentIds?: string[];
};

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 100 &&
    value.every((item) => typeof item === "string")
  );
}

async function saveResults(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  results: PipelineSynthesis[],
) {
  if (results.length === 0) return results;
  const { data, error } = await supabase.from("synthesis_runs").insert(
    results.map((result) => ({
      project_id: projectId,
      input_branch_ids: result.branch_ids,
      result: { pipeline_version: 3, ...result },
    })),
  ).select("id, result");
  if (error) throw new Error(`합성 결과 저장 실패: ${error.message}`);
  const runIdByResultId = new Map(
    (data ?? []).map((row: { id: string; result: { id?: string } }) => [
      row.result.id,
      row.id,
    ]),
  );
  return results.map((result) => ({
    ...result,
    run_id: runIdByResultId.get(result.id) ?? null,
  }));
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured || !process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "서버 환경변수가 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  const body = (await request.json().catch(() => null)) as SynthesizeBody | null;
  if (
    !body?.action ||
    typeof body.projectId !== "string" ||
    !isStringArray(body.branchIds)
  ) {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.SYNTHESIS_PIN || body.pin !== process.env.SYNTHESIS_PIN) {
    return Response.json({ error: "PIN이 올바르지 않습니다." }, { status: 403 });
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("project_id", body.projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return Response.json(
      { error: "프로젝트 입장 권한이 없습니다." },
      { status: 403 },
    );
  }

  const requestedBranchIds = Array.from(new Set(body.branchIds));

  const { data, error } = await supabase
    .from("branches")
    .select("id, idea, comments(id, body)")
    .eq("project_id", body.projectId)
    .in("id", requestedBranchIds)
    .order("created_at");
  if (error) {
    return Response.json(
      { error: "가지를 불러오지 못했습니다.", detail: error.message },
      { status: 500 },
    );
  }
  const branches: PipelineBranchInput[] = (data ?? []).map(
    (branch: {
      id: string;
      idea: string;
      comments: { id: string; body: string }[] | null;
    }) => ({
      id: branch.id,
      idea: branch.idea,
      comments: branch.comments ?? [],
    }),
  );
  if (branches.length === 0) {
    return Response.json({ error: "합성할 가지를 선택하세요." }, { status: 400 });
  }
  if (branches.length !== requestedBranchIds.length) {
    return Response.json(
      { error: "다른 프로젝트의 가지는 함께 합성할 수 없습니다." },
      { status: 403 },
    );
  }
  const anthropic = new Anthropic();
  console.info("[api/synthesize] action started", {
    action: body.action,
    branchCount: branches.length,
  });

  try {
    if (body.action === "extract_dimensions") {
      return Response.json(await extractDimensions({ anthropic, branches }));
    }
    const dimensions = Array.isArray(body.dimensions)
      ? body.dimensions.slice(0, 8)
      : [];
    const selectedCommentIds = Array.isArray(body.selectedCommentIds)
      ? body.selectedCommentIds
          .filter((id): id is string => typeof id === "string")
          .slice(0, 500)
      : [];
    if (dimensions.length === 0) {
      return Response.json(
        { error: "유지할 차원을 하나 이상 선택하세요." },
        { status: 400 },
      );
    }
    if (body.action === "generate_combinations") {
      return Response.json(
        await generateCombinations({ anthropic, branches, dimensions }),
      );
    }
    if (body.action === "synthesize_combinations") {
      const combinations = Array.isArray(body.combinations)
        ? body.combinations.slice(0, 6)
        : [];
      if (combinations.length === 0) {
        return Response.json(
          { error: "합성할 조합을 하나 이상 선택하세요." },
          { status: 400 },
        );
      }
      const response = await synthesizeDrafts({
        anthropic,
        branches,
        dimensions,
        combinations,
        selectedCommentIds,
      });
      const results = await saveResults(supabase, body.projectId, response.results);
      return Response.json({ ...response, results });
    }
    if (body.action === "upgrade_synthesis") {
      if (!body.combination || typeof body.previousX !== "string") {
        return Response.json(
          { error: "재합성할 조합과 초안이 필요합니다." },
          { status: 400 },
        );
      }
      const response = await upgradeSynthesis({
        anthropic,
        branches,
        dimensions,
        combination: body.combination,
        previousX: body.previousX,
        selectedCommentIds,
      });
      const [result] = await saveResults(supabase, body.projectId, [response.result]);
      return Response.json({ ...response, result });
    }
    return Response.json({ error: "지원하지 않는 단계입니다." }, { status: 400 });
  } catch (cause) {
    console.error("[api/synthesize] action failed", {
      action: body.action,
      branchCount: branches.length,
      error: cause instanceof Error ? cause.message : String(cause),
      stack: cause instanceof Error ? cause.stack : undefined,
    });
    return Response.json(
      {
        error: "현재 단계를 처리하지 못했습니다. 이 단계만 다시 시도해 주세요.",
        detail: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 502 },
    );
  }
}
