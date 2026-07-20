import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectRequest =
  | { action?: "create"; name?: string; password?: string }
  | { action?: "unlock"; projectId?: string; password?: string };

function validPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    password.length >= 4 &&
    password.length <= 72
  );
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return Response.json(
      { error: "서버 환경변수가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as ProjectRequest | null;
  if (!body?.action || !validPassword(body.password)) {
    return Response.json(
      { error: "비밀번호는 4~72자로 입력해 주세요." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (body.action === "create") {
    const name = body.name?.trim() ?? "";
    if (name.length < 1 || name.length > 80) {
      return Response.json(
        { error: "프로젝트 이름은 1~80자로 입력해 주세요." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("create_project", {
      p_name: name,
      p_password: body.password,
    });
    if (error) {
      const duplicate = error.code === "23505";
      return Response.json(
        {
          error: duplicate
            ? "이미 같은 이름의 프로젝트가 있습니다."
            : "프로젝트를 만들지 못했습니다.",
          detail: duplicate ? undefined : error.message,
        },
        { status: duplicate ? 409 : 500 },
      );
    }

    const project = Array.isArray(data) ? data[0] : null;
    if (!project?.project_id) {
      return Response.json(
        { error: "생성된 프로젝트를 확인하지 못했습니다." },
        { status: 500 },
      );
    }

    return Response.json({
      project: {
        id: project.project_id,
        name: project.project_name,
        created_at: project.project_created_at,
      },
    });
  }

  if (body.action === "unlock") {
    if (!body.projectId) {
      return Response.json(
        { error: "입장할 프로젝트가 필요합니다." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("unlock_project", {
      p_project_id: body.projectId,
      p_password: body.password,
    });
    if (error) {
      return Response.json(
        { error: "프로젝트 비밀번호를 확인하지 못했습니다.", detail: error.message },
        { status: 500 },
      );
    }
    if (!data) {
      return Response.json(
        { error: "비밀번호가 올바르지 않습니다." },
        { status: 403 },
      );
    }

    return Response.json({ unlocked: true });
  }

  return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
