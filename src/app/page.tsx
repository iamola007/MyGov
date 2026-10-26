import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";
import type { PostWithAuthor } from "@/types/database";

// A handful of topics surfaced as quick filters. `topic` is a free-text
// column in the schema (no enum/lookup table), so this is just a UI
// convenience — any topic value can still be reached via ?topic=whatever.
const FEATURED_TOPICS = ["national", "economy", "security", "education", "health"];

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("posts")
    .select("*, author:profiles(id, username, display_name)")
    .eq("status", "visible")
    .order("created_at", { ascending: false });

  if (topic) {
    query = query.eq("topic", topic);
  }

  const { data: posts, error } = await query.returns<PostWithAuthor[]>();

  let commentCounts: Record<string, number> = {};
  if (posts && posts.length > 0) {
    const counts = await Promise.all(
      posts.map((post) =>
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("post_id", post.id)
          .eq("status", "visible")
      )
    );
    commentCounts = Object.fromEntries(
      posts.map((post, i) => [post.id, counts[i].count ?? 0])
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href="/"
          className={`text-sm rounded-full px-3 py-1 border ${
            !topic
              ? "bg-green-700 text-white border-green-700"
              : "border-gray-300 text-gray-700 hover:bg-gray-100"
          }`}
        >
          All
        </Link>
        {FEATURED_TOPICS.map((t) => (
          <Link
            key={t}
            href={`/?topic=${encodeURIComponent(t)}`}
            className={`text-sm rounded-full px-3 py-1 border capitalize ${
              topic === t
                ? "bg-green-700 text-white border-green-700"
                : "border-gray-300 text-gray-700 hover:bg-gray-100"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600">Could not load posts right now.</p>
      )}

      {!error && posts?.length === 0 && (
        <p className="text-sm text-gray-500">
          No posts yet{topic ? ` in "${topic}"` : ""}. Be the first to start a
          discussion.
        </p>
      )}

      <ul className="space-y-3">
        {posts?.map((post) => (
          <li
            key={post.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300"
          >
            <Link href={`/posts/${post.id}`} className="block">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                {post.topic && (
                  <span className="bg-gray-100 rounded-full px-2 py-0.5 capitalize">
                    {post.topic}
                  </span>
                )}
                <span>
                  by {post.author?.display_name || post.author?.username || "unknown"}
                </span>
                <span>&middot;</span>
                <span>{timeAgo(post.created_at)}</span>
              </div>
              <h2 className="font-semibold text-gray-900 mb-1">{post.title}</h2>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{post.score} points</span>
                <span>{commentCounts[post.id] ?? 0} comments</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
