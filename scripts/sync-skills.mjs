import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { syncRepositorySkills } from "../server/skill-sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const userPresetsPath = path.join(dataDir, "skill-presets.json");
const localPresetsPath = path.join(rootDir, "skills", "awesome-gpt-image-2", "presets.json");

const local = JSON.parse(await fs.readFile(localPresetsPath, "utf8"));
const result = await syncRepositorySkills({
  userPresetsPath,
  includeLocal: true,
  localPresets: local.presets || []
});

console.log(`Synced ${result.presets.length} skills.`);
for (const summary of result.summaries) {
  console.log(`- ${summary.name}: ${summary.count}`);
}
