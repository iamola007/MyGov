"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Target = { postId: string; commentId?: never } | { commentId: string; postId?: never };

interface VoteButtonsProps {
  target: Target;
  initialScore: number;
  initialUserVote: 1 | -1 | 0;
  currentUserId: string | null;
}

// Up/down vote widget. Inserts/updates/deletes rows in `votes` directly —
// the DB trigger (trg_votes_after_change) keeps posts.score/comments.score
// in sync, so this component never computes or writes a score itself. The
// displayed score is updated optimistically by the delta the vote implies.
export default function VoteButtons({
  target,
  initialScore,
  initialUserVote,
  currentUserId,
}: VoteButtonsProps) {
  const router = useRouter();
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState<1 | -1 | 0>(initialUserVote);
  const [pending, setPending] = useState(false);

  async function castVote(value: 1 | -1) {
    if (!currentUserId) {
      router.push("/login");
      return;
    }
    if (pending) return;

    const previousScore = score;
    const previousVote = userVote;
    const isRemoving = userVote === value;
    const nextVote: 1 | -1 | 0 = isRemoving ? 0 : value;
    const delta = nextVote - previousVote;

    setPending(true);
    setUserVote(nextVote);
    setScore(previousScore + delta);

    const supabase = createClient();
    const matchColumn = target.postId ? "post_id" : "comment_id";
    const matchValue = target.postId ?? target.commentId!;

    try {
      if (isRemoving) {
        const { error } = await supabase
          .from("votes")
          .delete()
          .eq("user_id", currentUserId)
          .eq(matchColumn, matchValue);
        if (error) throw error;
      } else if (previousVote === 0) {
        const { error } = await supabase.from("votes").insert({
          user_id: currentUserId,
          post_id: target.postId ?? null,
          comment_id: target.commentId ?? null,
          value,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("votes")
          .update({ value })
          .eq("user_id", currentUserId)
          .eq(matchColumn, matchValue);
        if (error) throw error;
      }
    } catch {
      // Roll back the optimistic update on failure.
      setUserVote(previousVote);
      setScore(previousScore);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-1 text-sm select-none">
      <button
        type="button"
        onClick={() => castVote(1)}
        aria-label="Upvote"
        aria-pressed={userVote === 1}
        disabled={pending}
        className={`px-1.5 py-0.5 rounded hover:bg-gray-100 ${
          userVote === 1 ? "text-orange-600" : "text-gray-400"
        }`}
      >
        ▲
      </button>
      <span className="min-w-[1.5rem] text-center font-medium text-gray-800">
        {score}
      </span>
      <button
        type="button"
        onClick={() => castVote(-1)}
        aria-label="Downvote"
        aria-pressed={userVote === -1}
        disabled={pending}
        className={`px-1.5 py-0.5 rounded hover:bg-gray-100 ${
          userVote === -1 ? "text-blue-600" : "text-gray-400"
        }`}
      >
        ▼
      </button>
    </div>
  );
}
