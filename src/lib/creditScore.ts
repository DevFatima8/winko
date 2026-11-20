import type { UserDoc } from "@/models";
import type { MultiplayerTransaction } from "./multiplayer-store";

export const DEFAULT_CREDIT_SCORE = 100;

export async function adjustCreditScore(
  tx: MultiplayerTransaction,
  actor: { id: string; name: string; dbRole: string; level: number },
  userId: string,
  amount: number,
  direction: string,
) {
  if (actor.level < 1 || !["owner", "admin", "subadmin"].includes(actor.dbRole)) throw new Error("Admin access required.");
  if (!Number.isSafeInteger(amount) || amount <= 0 || !["add", "remove"].includes(direction)) {
    throw new Error("Enter a positive whole-number score and select increase or decrease.");
  }
  const user = await tx.get<UserDoc>("users", userId, true);
  if (!user || !["client", "agent"].includes(user.role) || (actor.level < 2 && user.referredBy !== actor.id)) {
    throw new Error("Player not found or not in your team.");
  }
  const before = user.creditScore ?? DEFAULT_CREDIT_SCORE;
  const after = before + (direction === "add" ? amount : -amount);
  if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(after) || after < 0) {
    throw new Error("Credit score cannot be negative or exceed supported whole-number precision.");
  }
  const now = new Date(await tx.now());
  user.creditScore = after;
  user.updatedAt = now;
  await tx.put("users", userId, user);
  const id = crypto.randomUUID();
  await tx.insert("adminlogs", id, {
    _id: id, actorId: actor.id, actorName: actor.name, actorRole: actor.dbRole,
    action: direction === "add" ? "credit_score_add" : "credit_score_remove",
    target: userId, details: `${before} -> ${after}`, createdAt: now, updatedAt: now,
  });
  return after;
}
