import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewPostForm from "@/components/NewPostForm";

export default async function NewPostPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/posts/new");
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Start a discussion</h1>
      <NewPostForm authorId={user.id} />
    </div>
  );
}
