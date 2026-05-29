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
