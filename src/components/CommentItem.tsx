"use client";

import { useState } from "react";
import type { CommentNode } from "@/lib/comments";
import { timeAgo } from "@/lib/time";
import VoteButtons from "@/components/VoteButtons";
import ReportButton from "@/components/ReportButton";
import CommentComposer from "@/components/CommentComposer";

interface CommentItemProps {
  comment: CommentNode;
  postId: string;
  currentUserId: string | null;
  voteMap: Record<string, 1 | -1>;
  depth?: number;
}

export default function CommentItem({
  comment,
  postId,
  currentUserId,
  voteMap,
  depth = 0,
}: CommentItemProps) {
  const [replying, setReplying] = useState(false);

  return (
    <div className={depth > 0 ? "pl-4 border-l border-gray-200 mt-3" : "mt-4"}>
      <div className="text-xs text-gray-500 mb-1">
        <span className="font-medium text-gray-700">
          {comment.author?.display_name || comment.author?.username || "unknown"}
        </span>{" "}
        &middot; {timeAgo(comment.created_at)}
        {comment.edited_at && <span> &middot; edited</span>}
      </div>
      <p className="text-sm text-gray-900 whitespace-pre-wrap">{comment.body}</p>
      <div className="flex items-center gap-3 mt-1">
        <VoteButtons
          target={{ commentId: comment.id }}
          initialScore={comment.score}
          initialUserVote={voteMap[comment.id] ?? 0}
          currentUserId={currentUserId}
        />
        <button
          type="button"
          onClick={() => setReplying((r) => !r)}
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          Reply
        </button>
        <ReportButton target={{ commentId: comment.id }} currentUserId={currentUserId} />
      </div>

      {replying && (
        <div className="mt-2">
          <CommentComposer
            postId={postId}
            parentCommentId={comment.id}
            currentUserId={currentUserId}
            onDone={() => setReplying(false)}
            autoFocus
            placeholder="Write a reply..."
          />
        </div>
      )}

      {comment.children.map((child) => (
        <CommentItem
          key={child.id}
          comment={child}
          postId={postId}
          currentUserId={currentUserId}
          voteMap={voteMap}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
