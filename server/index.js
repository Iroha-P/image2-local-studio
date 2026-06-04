import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import sharp from "sharp";
import { syncRepositorySkills } from "./skill-sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const imageDir = path.join(dataDir, "images");
const configPath = path.join(dataDir, "config.json");
const indexPath = path.join(dataDir, "images.json");
const defaultPresetsPath = path.join(rootDir, "skills", "awesome-gpt-image-2", "presets.json");
const userPresetsPath = path.join(dataDir, "skill-presets.json");
const port = Number(process.env.PORT || 8787);

const officialSizes = new Set(["auto", "1024x1024", "1536x1024", "1024x1536"]);
const finalSizePresets = {
  native: null,
  "1024x1024": [1024, 1024],
  "2048x2048": [2048, 2048],
  "4096x4096": [4096, 4096],
  "2048x3072": [2048, 3072],
  "3072x2048": [3072, 2048],
  "4096x6144": [4096, 6144],
  "6144x4096": [6144, 4096]
};

const defaultConfig = {
  apiKey: "",
  apiBase: "https://api.openai.com/v1",
  model: "gpt-image-2",
  size: "1024x1024",
  final_size: "native",
  custom_width: 4096,
  custom_height: 4096,
  upscale_kernel: "lanczos3",
  quality: "medium",
  background: "auto",
  output_format: "png",
  output_compression: 100,
  moderation: "auto",
  translate_model: "gpt-4.1-mini"
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8"
};

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

await ensureStorage();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.status, error.message, error.details);
    } else {
      sendError(res, 500, error.message || "服务内部错误。");
    }
  }
});

server.listen(port, () => {
  console.log(`Image2 local studio: http://localhost:${port}`);
});

async function ensureStorage() {
  await fs.mkdir(imageDir, { recursive: true });
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await ensureJson(configPath, defaultConfig);
  await ensureJson(indexPath, []);
  try {
    await fs.access(userPresetsPath);
  } catch {
    await resetUserPresets();
  }
}

async function ensureJson(filePath, fallback) {
  try {
    JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    await writeJson(filePath, fallback);
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function resetUserPresets() {
  const defaults = await readJson(defaultPresetsPath, { source: "", presets: [] });
  await writeJson(userPresetsPath, {
    ...defaults,
    customizedAt: null,
    resetAt: new Date().toISOString()
  });
  return defaults;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details) {
  sendJson(res, status, { error: message, details });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 50 * 1024 * 1024) throw new Error("请求内容太大。");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publicConfig(config) {
  const { apiKey, ...rest } = config;
  return {
    ...rest,
    hasApiKey: Boolean(apiKey || process.env.OPENAI_API_KEY),
    officialSizes: [...officialSizes],
    finalSizePresets: Object.keys(finalSizePresets)
  };
}

function cleanPayloadValue(value) {
  if (value === undefined || value === null || value === "" || value === "auto") return undefined;
  return value;
}

function extensionFor(format) {
  if (format === "jpeg") return "jpg";
  if (format === "webp") return "webp";
  return "png";
}

function normalizeConfig(input, current = defaultConfig) {
  const next = { ...defaultConfig, ...current };
  for (const key of ["apiBase", "model", "translate_model", "size", "final_size", "quality", "background", "output_format", "moderation", "upscale_kernel"]) {
    if (typeof input[key] === "string") next[key] = input[key].trim();
  }
  if (!officialSizes.has(next.size)) next.size = defaultConfig.size;
  if (!Object.hasOwn(finalSizePresets, next.final_size) && next.final_size !== "custom") next.final_size = "native";
  for (const key of ["output_compression", "custom_width", "custom_height"]) {
    if (Number.isFinite(Number(input[key]))) next[key] = Number(input[key]);
  }
  next.output_compression = clamp(next.output_compression, 0, 100);
  next.custom_width = clamp(next.custom_width, 256, 8192);
  next.custom_height = clamp(next.custom_height, 256, 8192);
  if (typeof input.apiKey === "string" && input.apiKey.trim()) next.apiKey = input.apiKey.trim();
  if (input.clearApiKey) next.apiKey = "";
  return next;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

async function callImageApi(payload, config) {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ApiError(400, "请先在 API 设置里保存 OpenAI API Key，或设置 OPENAI_API_KEY 环境变量。");
  }

  const apiBase = (config.apiBase || defaultConfig.apiBase).replace(/\/+$/, "");
  const response = await fetch(`${apiBase}/images/generations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(response.status, "OpenAI 返回了无法解析的响应。", text.slice(0, 500));
  }

  if (!response.ok) {
    throw new ApiError(response.status, json?.error?.message || "OpenAI 图像生成失败。", json);
  }

  return json;
}

async function saveGeneratedImages(apiResult, prompt, requestPayload, renderOptions) {
  const items = Array.isArray(apiResult.data) ? apiResult.data : [];
  const index = await readJson(indexPath, []);
  const saved = [];
  const format = requestPayload.output_format || "png";
  const ext = extensionFor(format);

  for (const item of items) {
    const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const filename = `${id}.${ext}`;
    const filePath = path.join(imageDir, filename);
    let bytes = await imageBytesFromResult(item);
    if (!bytes) continue;

    const sourceMeta = await sharp(bytes).metadata();
    const target = resolveFinalSize(renderOptions, sourceMeta);
    const wasUpscaled = Boolean(target && (target.width !== sourceMeta.width || target.height !== sourceMeta.height));

    if (target) {
      bytes = await sharp(bytes)
        .resize({
          width: target.width,
          height: target.height,
          fit: "fill",
          kernel: renderOptions.upscale_kernel || "lanczos3"
        })
        .toFormat(format === "jpg" ? "jpeg" : format, encodeOptions(format, renderOptions.output_compression))
        .toBuffer();
    }

    const finalMeta = await sharp(bytes).metadata();
    await fs.writeFile(filePath, bytes);
    const record = {
      id,
      filename,
      url: `/images/${filename}`,
      prompt,
      model: requestPayload.model,
      nativeSize: requestPayload.size || "auto",
      finalSize: `${finalMeta.width || "?"}x${finalMeta.height || "?"}`,
      requestedFinalSize: renderOptions.final_size || "native",
      quality: requestPayload.quality || "auto",
      format,
      bytes: bytes.length,
      upscaled: wasUpscaled,
      createdAt: new Date().toISOString(),
      revisedPrompt: item.revised_prompt || ""
    };
    index.unshift(record);
    saved.push(record);
  }

  await writeJson(indexPath, index);
  return saved;
}

async function imageBytesFromResult(item) {
  if (item.b64_json) {
    return Buffer.from(item.b64_json.replace(/^data:image\/\w+;base64,/, ""), "base64");
  }
  if (item.url) {
    const imageResponse = await fetch(item.url);
    if (imageResponse.ok) return Buffer.from(await imageResponse.arrayBuffer());
  }
  return null;
}

function resolveFinalSize(options, sourceMeta) {
  if (!options.final_size || options.final_size === "native") return null;
  if (options.final_size === "custom") {
    return {
      width: clamp(options.custom_width, 256, 8192),
      height: clamp(options.custom_height, 256, 8192)
    };
  }
  const preset = finalSizePresets[options.final_size];
  if (!preset) return null;
  return { width: preset[0], height: preset[1] };
}

function encodeOptions(format, compression) {
  const quality = format === "png" ? undefined : clamp(compression || 100, 1, 100);
  if (format === "jpeg") return { quality, mozjpeg: true };
  if (format === "webp") return { quality };
  return { compressionLevel: 9 };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, port, time: new Date().toISOString() });
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    const config = { ...defaultConfig, ...(await readJson(configPath, {})) };
    return sendJson(res, 200, publicConfig(config));
  }

  if (req.method === "POST" && url.pathname === "/api/config") {
    const body = await readBody(req);
    const current = { ...defaultConfig, ...(await readJson(configPath, {})) };
    const next = normalizeConfig(body, current);
    await writeJson(configPath, next);
    return sendJson(res, 200, publicConfig(next));
  }

  if (req.method === "GET" && url.pathname === "/api/presets") {
    const presets = await readJson(userPresetsPath, { source: "", presets: [] });
    return sendJson(res, 200, presets);
  }

  if (req.method === "POST" && url.pathname === "/api/presets") {
    const body = await readBody(req);
    const presets = sanitizePresets(body.presets);
    const current = await readJson(userPresetsPath, {});
    const next = {
      source: current.source || "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
      license: current.license || "CC BY 4.0",
      attribution: current.attribution || "",
      customizedAt: new Date().toISOString(),
      presets
    };
    await writeJson(userPresetsPath, next);
    return sendJson(res, 200, next);
  }

  if (req.method === "POST" && url.pathname === "/api/presets/reset") {
    await resetUserPresets();
    return sendJson(res, 200, await readJson(userPresetsPath, { presets: [] }));
  }

  if (req.method === "POST" && url.pathname === "/api/presets/sync") {
    const defaults = await readJson(defaultPresetsPath, { presets: [] });
    const synced = await syncRepositorySkills({
      userPresetsPath,
      includeLocal: true,
      localPresets: defaults.presets || []
    });
    return sendJson(res, 200, synced);
  }

  if (req.method === "POST" && url.pathname === "/api/presets/translate") {
    const body = await readBody(req);
    const config = { ...defaultConfig, ...(await readJson(configPath, {})) };
    const translated = await translatePresetToChinese(body.preset, config);
    return sendJson(res, 200, translated);
  }

  if (req.method === "GET" && url.pathname === "/api/images") {
    const images = await readJson(indexPath, []);
    return sendJson(res, 200, images);
  }

  if (req.method === "POST" && url.pathname === "/api/generate") {
    const body = await readBody(req);
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return sendError(res, 400, "请输入提示词。");

    const config = { ...defaultConfig, ...(await readJson(configPath, {})) };
    const requested = normalizeConfig({ ...config, ...(body.params || {}) }, config);
    const payload = {
      model: requested.model || defaultConfig.model,
      prompt,
      n: clamp(Number(body.count || 1), 1, 4),
      size: cleanPayloadValue(requested.size),
      quality: cleanPayloadValue(requested.quality),
      background: cleanPayloadValue(requested.background),
      output_format: cleanPayloadValue(requested.output_format),
      output_compression: requested.output_format === "png" ? undefined : Number(requested.output_compression),
      moderation: cleanPayloadValue(requested.moderation)
    };

    Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
    const apiResult = await callImageApi(payload, config);
    const images = await saveGeneratedImages(apiResult, prompt, payload, requested);
    return sendJson(res, 200, { images, rawCount: apiResult.data?.length || 0 });
  }

  const imageMatch = url.pathname.match(/^\/api\/images\/([^/]+)$/);
  if (req.method === "DELETE" && imageMatch) {
    const id = decodeURIComponent(imageMatch[1]);
    const images = await readJson(indexPath, []);
    const record = images.find((item) => item.id === id);
    if (!record) return sendError(res, 404, "未找到图片。");
    await fs.rm(path.join(imageDir, record.filename), { force: true });
    await writeJson(indexPath, images.filter((item) => item.id !== id));
    return sendJson(res, 200, { ok: true });
  }

  sendError(res, 404, "接口不存在。");
}

function sanitizePresets(items) {
  if (!Array.isArray(items)) throw new ApiError(400, "预设格式不正确。");
  return items.slice(0, 20000).map((item, index) => ({
    id: String(item.id || `preset-${index + 1}`).replace(/[^\w-]/g, "").slice(0, 64) || `preset-${index + 1}`,
    name: String(item.name || `预设 ${index + 1}`).slice(0, 80),
    description: String(item.description || "").slice(0, 240),
    prompt: String(item.prompt || "").slice(0, 6000),
    preview: String(item.preview || "/skill-previews/default.svg").slice(0, 500),
    source: String(item.source || "").slice(0, 300),
    license: String(item.license || "").slice(0, 80),
    category: String(item.category || "").slice(0, 120)
  })).filter((item) => item.prompt.trim());
}

async function translatePresetToChinese(preset, config) {
  if (!preset?.prompt) throw new ApiError(400, "没有可翻译的 Skill。");
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ApiError(400, "请先保存 OpenAI API Key，再翻译 Skill。");

  const apiBase = (config.apiBase || defaultConfig.apiBase).replace(/\/+$/, "");
  const payload = {
    model: config.translate_model || defaultConfig.translate_model,
    messages: [
      {
        role: "system",
        content: "你是专业的 AI 图像提示词本地化助手。把输入 Skill 翻译成简体中文，保留 JSON/Markdown/变量占位符/argument 语法/专有名词结构，不要删减细节。只返回严格 JSON。"
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Translate this image generation skill to Simplified Chinese.",
          output_schema: {
            name: "Chinese skill name",
            description: "Chinese skill description",
            prompt: "Chinese prompt preserving placeholders and structure"
          },
          preset
        })
      }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  };

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(response.status, "翻译接口返回了无法解析的响应。", text.slice(0, 500));
  }

  if (!response.ok) {
    throw new ApiError(response.status, json?.error?.message || "Skill 翻译失败。", json);
  }

  let translated;
  try {
    translated = JSON.parse(json.choices?.[0]?.message?.content || "{}");
  } catch {
    throw new ApiError(500, "翻译结果不是有效 JSON。", json);
  }

  return {
    ...preset,
    name: String(translated.name || preset.name || "").slice(0, 120),
    description: String(translated.description || preset.description || "").slice(0, 240),
    prompt: String(translated.prompt || preset.prompt || "").slice(0, 12000)
  };
}

async function serveStatic(req, res, url) {
  let filePath;
  if (url.pathname.startsWith("/images/")) {
    const filename = path.basename(decodeURIComponent(url.pathname.replace("/images/", "")));
    filePath = path.join(imageDir, filename);
  } else {
    const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    filePath = path.join(publicDir, safePath === "/" ? "index.html" : safePath);
  }

  const resolved = path.resolve(filePath);
  const allowed = resolved.startsWith(publicDir) || resolved.startsWith(imageDir);
  if (!allowed) return sendError(res, 403, "访问被拒绝。");

  try {
    const stat = await fs.stat(resolved);
    const finalPath = stat.isDirectory() ? path.join(resolved, "index.html") : resolved;
    const ext = path.extname(finalPath).toLowerCase();
    res.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": url.pathname.startsWith("/images/") || url.pathname.startsWith("/skill-previews/") ? "public, max-age=31536000" : "no-store"
    });
    res.end(await fs.readFile(finalPath));
  } catch {
    sendError(res, 404, "文件不存在。");
  }
}
