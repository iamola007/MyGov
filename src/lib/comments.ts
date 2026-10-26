import type { CommentWithAuthor } from "@/types/database";

export interface CommentNode extends CommentWithAuthor {
  children: CommentNode[];
}

// Turns the flat list of comments returned by the DB into a tree keyed off
// parent_comment_id, so the UI can render threaded replies recursively.
export function buildCommentTree(comments: CommentWithAuthor[]): CommentNode[] {
  const nodesById = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const comment of comments) {
    nodesById.set(comment.id, { ...comment, children: [] });
  }

  for (const comment of comments) {
    const node = nodesById.get(comment.id)!;
    if (comment.parent_comment_id) {
      const parent = nodesById.get(comment.parent_comment_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not visible/found (e.g. hidden) — surface at top level
        // rather than silently dropping the reply.
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}
