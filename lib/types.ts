export type Comment = {
  id: string;
  branch_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type Branch = {
  id: string;
  author_id: string;
  idea: string;
  created_at: string;
  comments: Comment[];
};

export type PipelineDimension = {
  id: string;
  label: string;
  description: string;
  branch_ids: string[];
};

export type CombinationCandidate = {
  id: string;
  branch_ids: string[];
  shared_dimension: string;
  tension: string;
  rationale: string;
};

export type PipelineSynthesis = {
  id: string;
  combination_id: string;
  branch_ids: string[];
  synthesis_possible: boolean;
  X: string;
  contribution: Record<string, string[]>;
  refusal_reason: string | null;
  model_tier: "draft" | "high";
};
