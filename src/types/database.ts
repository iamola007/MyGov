// Hand-written types mirroring supabase/schema.sql exactly.
// Keep these in sync manually whenever the schema changes — this MVP does not
// generate types via the Supabase CLI (no live project to point it at yet).

export type Role = "citizen" | "moderator" | "admin";
export type ContentStatus = "visible" | "hidden" | "removed";
export type ReportStatus = "open" | "reviewed" | "actioned" | "dismissed";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  state: string | null;
  lga: string | null;
  role: Role;
  is_verified: boolean;
  created_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  title: string;
  body: string;
  topic: string | null;
  status: ContentStatus;
  score: number;
  edited_at: string | null;
  created_at: string;
  // search_vector is generated/stored server-side and never read or written by the app.
}

export interface PostEdit {
  id: string;
  post_id: string;
  previous_title: string;
  previous_body: string;
  edited_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  status: ContentStatus;
  score: number;
  edited_at: string | null;
  created_at: string;
}

export interface CommentEdit {
  id: string;
  comment_id: string;
  previous_body: string;
  edited_at: string;
}

export interface Vote {
  id: string;
  user_id: string;
  post_id: string | null;
  comment_id: string | null;
  value: 1 | -1;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  status: ReportStatus;
  resolution_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// Convenience shapes for joined queries used by the UI.
export interface PostWithAuthor extends Post {
  author: Pick<Profile, "id" | "username" | "display_name"> | null;
  comment_count?: number;
}

export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, "id" | "username" | "display_name"> | null;
}
