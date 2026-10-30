import { dbConnect } from "./mongo";
import { Game, User, oid } from "@/models";
import { LOCAL_GAMES_CONNECTED, LOCAL_GAMES_UNAVAILABLE } from "./gameAvailability";
import { isGregmornSlug } from "./gregmornIdentity";

/** Returns an error string if the user may not play this game, else null. */
export async function checkGameAccess(userId: string | null, slug: string): Promise<string | null> {
  if (!LOCAL_GAMES_CONNECTED && !isGregmornSlug(slug)) return LOCAL_GAMES_UNAVAILABLE;
  await dbConnect();
  const g = await Game.findOne({ slug }, "isActive").lean();
  if (!g || !g.isActive) return "Ye game abhi band hai. Baad mein try karein.";
  if (!userId) return null;
  const u = await User.findById(oid(userId), "blockedGames isActive").lean();
  if (!u || !u.isActive) return "Aapka account block hai.";
  if ((u.blockedGames ?? []).includes(slug)) return "Aap is game ke liye restricted hain. Support se rabta karein.";
  return null;
}
