import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ProblemSessionWorkspace } from "@/components/problem-session";
import type {
  Branch,
  Comment,
  ProblemEvidence,
  ProblemEvidenceVote,
  ProblemNode,
  ProblemNodeVote,
  ProblemSession,
  Project,
} from "@/lib/types";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  if (!isSupabaseConfigured) redirect("/");

  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: project }, { data: membership }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, created_at")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("project_members")
      .select("project_id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!project) notFound();
  if (!membership) redirect("/");

  const [
    { data },
    { data: session },
    { data: nodes },
    { data: nodeVotes },
    { data: evidence },
    { data: evidenceVotes },
  ] = await Promise.all([
    supabase
      .from("branches")
      .select(
        "id, project_id, author_id, idea, created_at, comments(id, branch_id, author_id, body, created_at)",
      )
      .eq("project_id", projectId)
      .order("created_at"),
    supabase.from("problem_sessions").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("problem_nodes").select("*").eq("project_id", projectId).order("created_at"),
    supabase.from("problem_node_votes").select("node_id, author_id, created_at"),
    supabase.from("problem_evidence").select("*").eq("project_id", projectId).order("created_at"),
    supabase.from("problem_evidence_votes").select("evidence_id, author_id, created_at"),
  ]);

  const branches: Branch[] = (data ?? []).map(
    (branch: Branch & { comments: Comment[] | null }) => ({
      id: branch.id,
      project_id: branch.project_id,
      author_id: branch.author_id,
      idea: branch.idea,
      created_at: branch.created_at,
      comments: (branch.comments ?? []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      ),
    }),
  );

  return <ProblemSessionWorkspace
    project={project as Project}
    currentUserId={user.id}
    userEmail={user.email ?? "로그인 사용자"}
    initialSession={session as ProblemSession | null}
    initialBranches={branches}
    initialNodes={(nodes ?? []) as ProblemNode[]}
    initialNodeVotes={(nodeVotes ?? []) as ProblemNodeVote[]}
    initialEvidence={(evidence ?? []) as ProblemEvidence[]}
    initialEvidenceVotes={(evidenceVotes ?? []) as ProblemEvidenceVote[]}
  />;
}
