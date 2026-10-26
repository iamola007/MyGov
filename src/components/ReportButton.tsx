"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Target = { postId: string; commentId?: never } | { commentId: string; postId?: never };

interface ReportButtonProps {
  target: Target;
  currentUserId: string | null;
}

const REASONS = ["misinformation", "harassment", "defamation", "spam", "other"];

export default function ReportButton({ target, currentUserId }: ReportButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    if (!currentUserId) {
      router.push("/login");
      return;
    }
    setOpen(true);
  }

  async function submitReport() {
    if (!currentUserId) return;
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const fullReason = details.trim() ? `${reason}: ${details.trim()}` : reason;

    const { error: insertError } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      post_id: target.postId ?? null,
      comment_id: target.commentId ?? null,
      reason: fullReason,
    });

    setSubmitting(false);
    if (insertError) {
      setError("Could not submit report. Please try again.");
      return;
    }
    setDone(true);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openModal}
        className="text-xs text-gray-400 hover:text-gray-700"
      >
        Report
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-4">
        {done ? (
          <>
            <p className="text-sm text-gray-800">
              Thanks — this has been reported to moderators.
            </p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDone(false);
                setDetails("");
              }}
              className="mt-3 text-sm text-green-700 hover:underline"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h3 className="font-semibold text-gray-900 mb-3">Report content</h3>
            <label className="block text-sm text-gray-700 mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 mb-3 text-sm"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <label className="block text-sm text-gray-700 mb-1">
              Additional details (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 mb-3 text-sm"
            />
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-gray-600 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={submitting}
                className="text-sm bg-red-600 hover:bg-red-700 text-white rounded-md px-3 py-1.5 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
