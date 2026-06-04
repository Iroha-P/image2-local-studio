const form = document.querySelector("#generateForm");
const promptInput = document.querySelector("#prompt");
const message = document.querySelector("#message");
const statusPill = document.querySelector("#statusPill");
const configHint = document.querySelector("#configHint");
const imageWall = document.querySelector("#imageWall");
const presetSelect = document.querySelector("#presetSelect");
const skillPreview = document.querySelector("#skillPreview");
const skillName = document.querySelector("#skillName");
const skillDescription = document.querySelector("#skillDescription");
const skillPreviewUrl = document.querySelector("#skillPreviewUrl");
const skillPrompt = document.querySelector("#skillPrompt");
const previewDialog = document.querySelector("#previewDialog");
const previewImage = document.querySelector("#previewImage");
const previewPrompt = document.querySelector("#previewPrompt");

const fields = [
  "apiBase",
  "model",
  "translate_model",
  "size",
  "final_size",
  "custom_width",
  "custom_height",
  "upscale_kernel",
  "quality",
  "background",
  "output_format",
  "output_compression",
  "moderation"
];

const defaults = {
  apiBase: "https://api.openai.com/v1",
  model: "gpt-image-2",
  translate_model: "gpt-4.1-mini",
  size: "1024x1024",
  final_size: "native",
  custom_width: 4096,
  custom_height: 4096,
  upscale_kernel: "lanczos3",
  quality: "medium",
  background: "auto",
  output_format: "png",
  output_compression: 100,
  moderation: "auto"
};

let presets = [];
let selectedPresetIndex = 0;

await Promise.all([loadConfig(), loadPresets(), loadImages()]);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "请求失败");
  return json;
}

function setMessage(text, tone = "muted") {
  message.textContent = text;
  message.style.color = tone === "error" ? "#b42318" : tone === "ok" ? "#1d5154" : "";
}

function getParams() {
  return Object.fromEntries(fields.map((field) => [field, document.querySelector(`#${field}`).value]));
}

function fillConfig(config) {
  for (const field of fields) {
    document.querySelector(`#${field}`).value = config[field] ?? defaults[field];
  }
  statusPill.textContent = config.hasApiKey ? "已配置" : "未配置";
  statusPill.classList.toggle("ready", Boolean(config.hasApiKey));
  configHint.textContent = config.hasApiKey ? "Key 已保存在本地" : "尚未保存 Key";
  syncCustomSizeVisibility();
}

async function loadConfig() {
  const config = await api("/api/config");
  fillConfig(config);
}

async function saveConfig(clearApiKey = false) {
  const payload = getParams();
  payload.apiKey = document.querySelector("#apiKey").value;
  payload.clearApiKey = clearApiKey;
  const config = await api("/api/config", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  document.querySelector("#apiKey").value = "";
  fillConfig(config);
  configHint.textContent = clearApiKey ? "Key 已清除" : "配置已保存";
}

async function loadPresets(keepIndex = 0) {
  const data = await api("/api/presets");
  presets = data.presets || [];
  selectedPresetIndex = Math.min(keepIndex, Math.max(0, presets.length - 1));
  renderPresetSelect();
  renderSkillEditor(selectedPresetIndex);
}

function renderPresetSelect() {
  presetSelect.innerHTML = presets
    .map((preset, index) => `<option value="${index}">${escapeHtml(preset.name)}</option>`)
    .join("");
  presetSelect.value = String(selectedPresetIndex);
}

function renderSkillEditor(index) {
  const preset = presets[index];
  if (!preset) return;
  selectedPresetIndex = index;
  skillName.value = preset.name || "";
  skillDescription.value = preset.description || "";
  skillPreviewUrl.value = preset.preview || "/skill-previews/default.svg";
  skillPrompt.value = preset.prompt || "";
  skillPreview.src = skillPreviewUrl.value || "/skill-previews/default.svg";
}

function updateCurrentSkillFromEditor() {
  const current = presets[selectedPresetIndex];
  if (!current) return;
  current.name = skillName.value.trim() || "未命名 Skill";
  current.description = skillDescription.value.trim();
  current.preview = skillPreviewUrl.value.trim() || "/skill-previews/default.svg";
  current.prompt = skillPrompt.value.trim();
}

async function saveSkills() {
  updateCurrentSkillFromEditor();
  const result = await api("/api/presets", {
    method: "POST",
    body: JSON.stringify({ presets })
  });
  presets = result.presets || presets;
  renderPresetSelect();
  renderSkillEditor(selectedPresetIndex);
  setMessage("Skill 已保存。", "ok");
}

async function resetSkills() {
  const result = await api("/api/presets/reset", { method: "POST" });
  presets = result.presets || [];
  selectedPresetIndex = 0;
  renderPresetSelect();
  renderSkillEditor(0);
  setMessage("Skill 已重置为内置版本。", "ok");
}

async function syncSkills() {
  try {
    setMessage("正在同步两个仓库的中文 Skill 场景...");
    const result = await api("/api/presets/sync", { method: "POST" });
    presets = result.presets || [];
    selectedPresetIndex = 0;
    renderPresetSelect();
    renderSkillEditor(0);
    const summary = (result.summaries || []).map((item) => `${item.name} ${item.count}`).join("，");
    setMessage(`已同步 ${presets.length} 个 Skill。${summary}`, "ok");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

async function translateCurrentSkill() {
  try {
    updateCurrentSkillFromEditor();
    const current = presets[selectedPresetIndex];
    if (!current) return;
    setMessage("正在翻译当前 Skill...");
    const translated = await api("/api/presets/translate", {
      method: "POST",
      body: JSON.stringify({ preset: current })
    });
    presets[selectedPresetIndex] = translated;
    renderPresetSelect();
    renderSkillEditor(selectedPresetIndex);
    await saveSkills();
    setMessage("当前 Skill 已翻译并保存。", "ok");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function newSkill() {
  updateCurrentSkillFromEditor();
  presets.push({
    id: `custom-${Date.now()}`,
    name: "新 Skill",
    description: "写下这个 Skill 的使用场景。",
    preview: "/skill-previews/default.svg",
    prompt: "Create an image of [主题]. Describe subject, composition, lighting, color palette, style, details, and final usage."
  });
  selectedPresetIndex = presets.length - 1;
  renderPresetSelect();
  renderSkillEditor(selectedPresetIndex);
}

async function deleteSkill() {
  if (!presets.length) return;
  const removed = presets[selectedPresetIndex]?.name || "当前 Skill";
  presets.splice(selectedPresetIndex, 1);
  if (!presets.length) {
    presets.push({
      id: `custom-${Date.now()}`,
      name: "新 Skill",
      description: "写下这个 Skill 的使用场景。",
      preview: "/skill-previews/default.svg",
      prompt: "Create an image of [主题]. Describe subject, composition, lighting, color palette, style, details, and final usage."
    });
  }
  selectedPresetIndex = Math.min(selectedPresetIndex, presets.length - 1);
  renderPresetSelect();
  renderSkillEditor(selectedPresetIndex);
  await saveSkills();
  setMessage(`已删除：${removed}`, "ok");
}

function applySkillToPrompt() {
  updateCurrentSkillFromEditor();
  const preset = presets[selectedPresetIndex];
  if (!preset) return;
  promptInput.value = preset.prompt;
  setMessage(`已调用：${preset.name}`, "ok");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

async function loadImages() {
  const images = await api("/api/images");
  if (!images.length) {
    imageWall.innerHTML = `<div class="empty">还没有图片。生成成功后会自动保存到本地图片墙。</div>`;
    return;
  }
  imageWall.innerHTML = images.map(renderImage).join("");
}

function renderImage(image) {
  const meta = [
    image.nativeSize ? `原生 ${image.nativeSize}` : "",
    image.finalSize ? `导出 ${image.finalSize}` : "",
    image.upscaled ? "已超分" : ""
  ].filter(Boolean).join(" / ");

  return `
    <article class="image-card" data-id="${escapeHtml(image.id)}">
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.prompt)}" loading="lazy" />
      <div class="image-meta">
        <p>${escapeHtml(image.prompt)}</p>
        <span class="image-size">${escapeHtml(meta)}</span>
        <div class="image-actions">
          <button class="subtle-button" data-action="preview" type="button">预览</button>
          <a class="subtle-button" href="${escapeHtml(image.url)}" download="${escapeHtml(image.filename)}">保存</a>
          <button class="subtle-button" data-action="delete" type="button">删除</button>
        </div>
      </div>
    </article>
  `;
}

async function generate(event) {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return setMessage("请输入提示词。", "error");

  const button = document.querySelector("#generateBtn");
  button.disabled = true;
  setMessage("正在生成、超分并保存图片...");
  try {
    const result = await api("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        count: Number(document.querySelector("#count").value || 1),
        params: getParams()
      })
    });
    setMessage(`已保存 ${result.images.length} 张图片。`, "ok");
    await loadImages();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function syncCustomSizeVisibility() {
  const custom = document.querySelector("#final_size").value === "custom";
  document.querySelector(".custom-size-row").classList.toggle("is-hidden", !custom);
}

imageWall.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const card = target.closest(".image-card");
  if (!card) return;
  const id = card.dataset.id;
  if (target.dataset.action === "preview") {
    const img = card.querySelector("img");
    const text = card.querySelector("p");
    const size = card.querySelector(".image-size");
    previewImage.src = img.src;
    previewPrompt.textContent = `${size?.textContent || ""}\n${text.textContent || ""}`;
    previewDialog.showModal();
  }
  if (target.dataset.action === "delete") {
    await api(`/api/images/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadImages();
  }
});

document.querySelector("#saveConfigBtn").addEventListener("click", () => saveConfig(false));
document.querySelector("#clearKeyBtn").addEventListener("click", () => saveConfig(true));
document.querySelector("#refreshBtn").addEventListener("click", loadImages);
document.querySelector("#resetParamsBtn").addEventListener("click", () => fillConfig({ ...defaults, hasApiKey: statusPill.classList.contains("ready") }));
document.querySelector("#copyPromptBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(promptInput.value);
  setMessage("提示词已复制。", "ok");
});
document.querySelector("#closePreviewBtn").addEventListener("click", () => previewDialog.close());
document.querySelector("#final_size").addEventListener("change", syncCustomSizeVisibility);
presetSelect.addEventListener("change", (event) => {
  updateCurrentSkillFromEditor();
  renderSkillEditor(Number(event.target.value));
});
skillPreviewUrl.addEventListener("input", () => {
  skillPreview.src = skillPreviewUrl.value || "/skill-previews/default.svg";
});
document.querySelector("#applySkillBtn").addEventListener("click", applySkillToPrompt);
document.querySelector("#newSkillBtn").addEventListener("click", newSkill);
document.querySelector("#saveSkillBtn").addEventListener("click", saveSkills);
document.querySelector("#deleteSkillBtn").addEventListener("click", deleteSkill);
document.querySelector("#syncSkillBtn").addEventListener("click", syncSkills);
document.querySelector("#translateSkillBtn").addEventListener("click", translateCurrentSkill);
document.querySelector("#resetSkillBtn").addEventListener("click", resetSkills);
form.addEventListener("submit", generate);
