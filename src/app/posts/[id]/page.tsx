import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";
import { buildCommentTree } from "@/lib/comments";
import VoteButtons from "@/components/VoteButtons";
import ReportButton from "@/components/ReportButton";
import CommentComposer from "@/components/CommentComposer";
import CommentItem from "@/components/CommentItem";
import type { PostWithAuthor, CommentWithAuthor } from "@/types/database";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: post } = (await supabase
    .from("posts")
    .select("*, author:profiles(id, username, display_name)")
    .eq("id", id)
    .maybeSingle()) as { data: PostWithAuthor | null };

  if (!post) {
    notFound();
  }

  const { data: comments } = await supabase
    .from("comments")
    .select("*, author:profiles(id, username, display_name)")
    .eq("post_id", id)
    .eq("status", "visible")
    .order("created_at", { ascending: true })
    .returns<CommentWithAuthor[]>();

  const commentList = comments ?? [];

  let postVote: 1 | -1 | 0 = 0;
  const voteMap: Record<string, 1 | -1> = {};

  if (user) {
    const { data: myPostVote } = await supabase
      .from("votes")
      .select("value")
      .eq("user_id", user.id)
      .eq("post_id", id)
      .maybeSingle();
    if (myPostVote) postVote = myPostVote.value as 1 | -1;

    if (commentList.length > 0) {
      const { data: myCommentVotes } = await supabase
        .from("votes")
        .select("comment_id, value")
        .eq("user_id", user.id)
        .in(
          "comment_id",
          commentList.map((c) => c.id)
        );
      for (const v of myCommentVotes ?? []) {
        if (v.comment_id) voteMap[v.comment_id] = v.value as 1 | -1;
      }
    }
  }

  const tree = buildCommentTree(commentList);

  return (
    <article>
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          {post.topic && (
            <Link
              href={`/?topic=${encodeURIComponent(post.topic)}`}
              className="bg-gray-100 rounded-full px-2 py-0.5 capitalize hover:bg-gray-200"
            >
              {post.topic}
            </Link>
          )}
          <span>
            by {post.author?.display_name || post.author?.username || "unknown"}
          </span>
          <span>&middot;</span>
          <span>{timeAgo(post.created_at)}</span>
          {post.edited_at && <span>&middot; edited</span>}
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-3">{post.title}</h1>
        <p className="text-gray-900 whitespace-pre-wrap mb-4">{post.body}</p>

        <div className="flex items-center gap-4">
          <VoteButtons
            target={{ postId: post.id }}
            initialScore={post.score}
            initialUserVote={postVote}
            currentUserId={user?.id ?? null}
          />
          <ReportButton target={{ postId: post.id }} currentUserId={user?.id ?? null} />
        </div>
      </div>

      <section>
        <h2 className="font-semibold text-gray-900 mb-3">
          {commentList.length} {commentList.length === 1 ? "comment" : "comments"}
        </h2>

        <CommentComposer postId={post.id} currentUserId={user?.id ?? null} />

        <div>
          {tree.map((node) => (
            <CommentItem
              key={node.id}
              comment={node}
              postId={post.id}
              currentUserId={user?.id ?? null}
              voteMap={voteMap}
            />
          ))}
        </div>
      </section>
    </article>
  );
}
