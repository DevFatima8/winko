import { ensureGames } from "./src/lib/seed";
import { dbConnect } from "./src/lib/mongo";
async function run() {
  await dbConnect();
  await ensureGames();
  console.log("Database seeded successfully.");
  process.exit(0);
}
run();
