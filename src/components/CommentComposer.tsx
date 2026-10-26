"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface CommentComposerProps {
  postId: string;
  parentCommentId?: string;
  currentUserId: string | null;
  onDone?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}

// Shared form for both top-level comments and threaded replies. On submit
// it just inserts a row into `comments`; the server re-renders the thread
// via router.refresh() so we don't have to duplicate the comment tree logic
// on the client.
export default function CommentComposer({
  postId,
  parentCommentId,
  currentUserId,
  onDone,
  autoFocus,
  placeholder = "Add a comment...",
}: CommentComposerProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId) {
      router.push("/login");
      return;
    }
    if (!body.trim()) return;

    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("comments").insert({
      post_id: postId,
      author_id: currentUserId,
      parent_comment_id: parentCommentId ?? null,
      body: body.trim(),
    });
    setSubmitting(false);

    if (insertError) {
      setError("Could not post your comment. Please try again.");
      return;
    }

    setBody("");
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={parentCommentId ? 2 : 3}
        autoFocus={autoFocus}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-700"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="text-sm bg-green-700 hover:bg-green-800 text-white rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {submitting ? "Posting..." : parentCommentId ? "Reply" : "Comment"}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-gray-600 px-3 py-1.5"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
