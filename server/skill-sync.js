import { promises as fs } from "node:fs";
import path from "node:path";

export const skillRepositories = [
  {
    id: "youmind",
    name: "YouMind OpenLab",
    source: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
    license: "CC BY 4.0",
    readmeUrl: "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_zh.md",
    parser: "numbered"
  },
  {
    id: "evolink",
    name: "EvoLinkAI",
    source: "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts",
    license: "CC0 1.0",
    readmeUrl: "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/README_zh-CN.md",
    parser: "case"
  }
];

export async function syncRepositorySkills({ userPresetsPath, includeLocal = true, localPresets = [] }) {
  const allPresets = includeLocal ? [...localPresets] : [];
  const summaries = [];

  for (const repo of skillRepositories) {
    const markdown = await fetchTextWithRetry(repo.readmeUrl);
    const parsed = parsePromptReadme(markdown, repo);
    summaries.push({ id: repo.id, name: repo.name, count: parsed.length, source: repo.source, license: repo.license });
    allPresets.push(...parsed);
  }

  const unique = dedupePresets(allPresets);
  const payload = {
    source: skillRepositories.map((repo) => repo.source).join(" + "),
    license: "YouMind: CC BY 4.0; EvoLinkAI: CC0 1.0",
    attribution: "Synced from YouMind OpenLab/awesome-gpt-image-2 and EvoLinkAI/awesome-gpt-image-2-API-and-Prompts. Keep source links and licenses with reused prompts.",
    syncedAt: new Date().toISOString(),
    summaries,
    presets: unique
  };

  await fs.mkdir(path.dirname(userPresetsPath), { recursive: true });
  await fs.writeFile(userPresetsPath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export function parsePromptReadme(markdown, repo) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let currentCategory = "";

  for (let index = 0; index < lines.length; index += 1) {
    const h2 = lines[index].match(/^##\s+(.+)/);
    if (h2) currentCategory = cleanMarkdown(h2[1]);

    const heading = repo.parser === "case"
      ? lines[index].match(/^###\s+Case\s+(\d+):\s+(.+)/)
      : lines[index].match(/^###\s+No\.\s*(\d+):\s+(.+)/);

    if (!heading) continue;

    const start = index;
    let end = lines.length;
    for (let j = index + 1; j < lines.length; j += 1) {
      if (/^###\s+(Case\s+\d+:|No\.\s*\d+:)/.test(lines[j])) {
        end = j;
        break;
      }
    }

    const section = lines.slice(start, end).join("\n");
    const prompt = extractPrompt(section);
    if (!prompt) continue;

    const numericId = heading[1];
    const title = cleanMarkdown(heading[2]);
    const preview = extractPreview(section);
    const description = extractDescription(section) || currentCategory || repo.name;

    blocks.push({
      id: `${repo.id}-${numericId}-${slugify(title)}`,
      name: `${repo.name} ${numericId}: ${title}`.slice(0, 120),
      description: `${description} · ${repo.license}`.slice(0, 240),
      prompt,
      preview,
      source: repo.source,
      license: repo.license,
      category: currentCategory
    });
    index = end - 1;
  }

  return blocks;
}

function extractPrompt(section) {
  const promptHeading = section.search(/\*\*Prompt:\*\*|####\s+.*Prompt|####\s+.*提示词/i);
  const scoped = promptHeading >= 0 ? section.slice(promptHeading) : section;
  const fence = scoped.match(/```(?:json|text|prompt)?\s*\n([\s\S]*?)\n```/i);
  if (!fence) return "";
  return fence[1].trim();
}

function extractPreview(section) {
  const img = section.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img) return img[1];
  const md = section.match(/!\[[^\]]*]\(([^)]+)\)/);
  if (md) return md[1].split(/\s+/)[0];
  return "/skill-previews/default.svg";
}

function extractDescription(section) {
  const match = section.match(/####\s+.*(?:Description|描述)\s*\n+([\s\S]*?)(?:\n####|\n\*\*Prompt|\n---)/i);
  if (!match) return "";
  return cleanMarkdown(match[1]).slice(0, 180);
}

function cleanMarkdown(value) {
  return String(value)
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\s+\(by\s+.*?\)\s*$/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[#*_`>|[\]]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return cleanMarkdown(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "prompt";
}

function dedupePresets(presets) {
  const seen = new Set();
  const output = [];
  for (const preset of presets) {
    const key = preset.id || `${preset.name}:${preset.prompt.slice(0, 80)}`;
    if (seen.has(key) || !preset.prompt?.trim()) continue;
    seen.add(key);
    output.push(preset);
  }
  return output;
}

async function fetchTextWithRetry(url, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "image2-local-studio"
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}
