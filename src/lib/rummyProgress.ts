import type { MultiplayerTransaction } from "./multiplayer-store";

type Progress = { _id: string; unlockedLevel: number };
const progressId = (userId: string) => `rummy:levels:${userId}`;

export async function rummyUnlockedLevel(tx: MultiplayerTransaction, userId: string) {
  const saved = await tx.get<Progress>("multiplayerrooms", progressId(userId));
  if (!saved) return 1;
  if (!Number.isInteger(saved.unlockedLevel) || saved.unlockedLevel < 1 || saved.unlockedLevel > 5) {
    throw new Error("Saved Rummy level progress is invalid.");
  }
  return saved.unlockedLevel;
}

export async function unlockRummyLevel(tx: MultiplayerTransaction, userId: string, wonLevel: number) {
  const unlockedLevel = Math.max(await rummyUnlockedLevel(tx, userId), Math.min(5, wonLevel + 1));
  const _id = progressId(userId);
  await tx.put("multiplayerrooms", _id, { _id, unlockedLevel });
  return unlockedLevel;
}
