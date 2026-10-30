import { dbConnect } from "./mongo";
import { Feedback, oid } from "@/models";
import type { CurrentUser } from "./auth";

export async function submitFeedback(b: { name?: string; phone?: string; type?: string; message?: string }, me: CurrentUser | null) {
  await dbConnect();
  const message = typeof b.message === "string" ? b.message.trim() : "";
  const type = b.type;
  if (type !== "reward" && type !== "complaint" && type !== "suggestion" && type !== "other") return { error: "Please select a feedback type." };
  if (!message) return { error: "Message required." };
  if (message.length > 3000) return { error: "Feedback must be 3000 characters or fewer." };
  const name = me?.name ?? String(b.name ?? "").trim().slice(0, 80);
  const phone = me?.phone ?? String(b.phone ?? "").trim().slice(0, 20);
  if (!me && (!name || !phone)) return { error: "Name and phone required." };
  await Feedback.create({ userId: me ? oid(me.id) : null, name, phone, type, message });
  return { ok: true };
}
