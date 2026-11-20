const resumeFileInput = document.querySelector("#resumeFile");
const dropzone = document.querySelector("#dropzone");
const browseButton = document.querySelector("#browseButton");
const resumeText = document.querySelector("#resumeText");
const jobDescription = document.querySelector("#jobDescription");
const analyzeButton = document.querySelector("#analyzeButton");
const roleWordCount = document.querySelector("#roleWordCount");
const fileStatus = document.querySelector("#fileStatus");
const toast = document.querySelector("#toast");

let uploadedResumeText = "";
let selectedFileName = "";

const stopWords = new Set([
  "the", "and", "for", "with", "you", "your", "our", "will", "have", "has", "that",
  "this", "from", "are", "was", "were", "who", "what", "where", "when", "able",
  "including", "work", "role", "team", "candidate", "company", "looking", "job",
  "about", "into", "using", "use", "than", "then", "they", "their", "must", "should"
]);

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function normalizeText(text) {
  return typeof text === "string"
    ? text.toLowerCase().replace(/[^\w+#.-]+/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function wordsOf(text) {
  return normalizeText(text).split(" ").filter(Boolean);
}

function updateControls() {
  const count = wordsOf(jobDescription.value).length;
  roleWordCount.textContent = `${count} ${count === 1 ? "word" : "words"}`;
  const resumeAvailable = uploadedResumeText.trim() || resumeText.value.trim();
  analyzeButton.disabled = !(resumeAvailable && jobDescription.value.trim());
}

async function extractText(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "txt") return await file.text();

  if (extension === "pdf") {
    if (!window.pdfjsLib) throw new Error("PDF reader could not load.");
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    let text = "";
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + "\n";
    }
    return text;
  }

  if (extension === "docx") {
    if (!window.mammoth) throw new Error("DOCX reader could not load.");
    const buffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  throw new Error("Please upload a PDF, DOCX or TXT file.");
}

async function handleFile(file) {
  if (!file) return;
  const allowed = /\.(pdf|docx|txt)$/i;
  if (!allowed.test(file.name)) {
    showToast("Unsupported file type");
    return;
  }

  try {
    showToast("Reading resume...");
    const text = await extractText(file);
    if (!text.trim()) throw new Error("No readable text was found in this file.");
    uploadedResumeText = text;
    selectedFileName = file.name;
    document.querySelector("#fileName").textContent = file.name;
    document.querySelector("#fileSize").textContent = formatFileSize(file.size);
    document.querySelector(".file-icon").textContent =
      file.name.split(".").pop().toUpperCase();
    fileStatus.hidden = false;
    dropzone.hidden = true;
    updateControls();
    showToast("Resume loaded");
  } catch (error) {
    showToast(error.message || "Could not read this file");
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

browseButton.addEventListener("click", (event) => {
  event.stopPropagation();
  resumeFileInput.click();
});
dropzone.addEventListener("click", () => resumeFileInput.click());
resumeFileInput.addEventListener("change", () => handleFile(resumeFileInput.files[0]));

["dragenter", "dragover"].forEach((name) => {
  dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((name) => {
  dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
});
dropzone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));

document.querySelector("#removeFile").addEventListener("click", () => {
  uploadedResumeText = "";
  selectedFileName = "";
  resumeFileInput.value = "";
  fileStatus.hidden = true;
  dropzone.hidden = false;
  updateControls();
});

resumeText.addEventListener("input", updateControls);
jobDescription.addEventListener("input", updateControls);
document.querySelector("#clearRole").addEventListener("click", () => {
  jobDescription.value = "";
  updateControls();
  jobDescription.focus();
});

document.querySelector("#themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
});

function extractKeywords(text, limit = 18) {
  const candidates = normalizeText(text).match(/[a-z][a-z0-9+#.-]{2,}/g) || [];
  const counts = {};
  candidates.forEach((word) => {
    if (!stopWords.has(word) && word.length > 2) counts[word] = (counts[word] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, limit);
}

function hasTerm(text, term) {
  return new RegExp(`(^|[^a-z0-Z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zA-Z0-9]|$)`, "i").test(text);
}

function findBulletLines(text) {
  return text
    .split(/\n/)
    .map((line) => line.replace(/^[\s•*-]+/, "").trim())
    .filter((line) => line.length >= 28 && line.length <= 220);
}

function buildSuggestions(resume, bullets) {
  const genericPatterns = [
    /responsible for/i,
    /worked on/i,
    /helped with/i,
    /involved in/i,
    /assisted/i,
    /duties included/i,
  ];
  const candidates = bullets.filter((line) =>
    genericPatterns.some((pattern) => pattern.test(line))
  );
  if (!candidates.length) candidates.push(...bullets.slice(0, 2));

  return candidates.slice(0, 3).map((original) => {
    let improved = original
      .replace(/^responsible for\s*/i, "Led ")
      .replace(/^worked on\s*/i, "Built ")
      .replace(/^helped with\s*/i, "Contributed to ")
      .replace(/^involved in\s*/i, "Delivered ")
      .replace(/^assisted\s*/i, "Supported ")
      .replace(/^duties included\s*/i, "Managed ");

    if (!/^(led|built|developed|designed|implemented|delivered|created|managed|optimized|contributed|supported|automated|analyzed|launched|collaborated)\b/i.test(improved)) {
      improved = `Developed ${improved.charAt(0).toLowerCase()}${improved.slice(1)}`;
    }

    if (!/\d|%/.test(improved)) {
      improved += " and documented the outcome, timeframe, and measurable impact";
    }
    return { section: "Experience", original_text: original, improved_text: improved };
  });
}

function analyzeResume(resume, job) {
  const resumeNormalized = normalizeText(resume);
  const jobNormalized = normalizeText(job);
  const resumeWords = new Set(resumeNormalized.split(" "));
  const jobKeywords = extractKeywords(job, 25);

  const matched = jobKeywords.filter((keyword) => resumeWords.has(keyword) || resumeNormalized.includes(keyword));
  const missing = jobKeywords.filter((keyword) => !resumeWords.has(keyword) && !resumeNormalized.includes(keyword));

  const nameLike = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/.test(resume);
  const hasEmail = /\b[\w.-]+@[\w.-]+\.\w+\b/.test(resume);
  const hasPhone = /(?:\+?\d[\d\s().-]{7,}\d)/.test(resume);
  const sections = /education|experience|projects|skills|summary|work|certifications/i.test(resume);

  let score = 30;
  const keywordCoverage = jobKeywords.length ? matched.length / jobKeywords.length : 0;
  score += Math.round(keywordCoverage * 55);
  if (nameLike) score += 3;
  if (hasEmail) score += 2;
  if (hasPhone) score += 2;
  if (sections) score += 5;
  if (findBulletLines(resume).length >= 3) score += 3;
  score = Math.max(0, Math.min(100, score));

  const strengths = [];
  if (matched.length) strengths.push(...matched.slice(0, 8).map((item) => item.replace(/\b\w/g, (letter) => letter.toUpperCase())));
  if (!strengths.length) strengths.push("Core resume information is present");

  const formatting = [];
  if (!nameLike) formatting.push("Add a clear, standard name header at the top.");
  if (!hasEmail) formatting.push("Add a professional email address.");
  if (!hasPhone) formatting.push("Include a current phone number.");
  if (!sections) formatting.push("Use standard headings such as Experience, Education, Projects, and Skills.");
  if (resume.length > 9000) formatting.push("The resume may be too long; keep it concise and recruiter-scannable.");
  if (!/•|\*|\-/m.test(resume) && findBulletLines(resume).length < 3) {
    formatting.push("Use short bullets instead of dense paragraphs.");
  }
  if (!formatting.length) formatting.push("Layout appears readable; maintain consistent spacing and simple headings.");

  const coverageLabel = keywordCoverage >= .7 ? "strong" : keywordCoverage >= .4 ? "moderate" : "limited";
  const summary =
    `Your resume has ${coverageLabel} keyword alignment with this role, with ${matched.length} of ${jobKeywords.length} high-value terms detected. ` +
    `${missing.length ? "The clearest opportunities are stronger role-specific keywords, quantified impact, and better section clarity." : "The resume is well aligned overall; sharpen measurable outcomes and verify that each claim is concise."}`;

  return {
    ats_score: score,
    summary,
    strengths,
    missing_keywords: missing.slice(0, 12),
    formatting_issues: formatting,
    improvement_suggestions: buildSuggestions(resume, findBulletLines(resume)),
  };
}

analyzeButton.addEventListener("click", () => {
  const resume = (uploadedResumeText || resumeText.value).trim();
  const job = jobDescription.value.trim();
  if (!resume || !job) return;

  analyzeButton.disabled = true;
  analyzeButton.querySelector("span").textContent = "Analyzing...";

  window.setTimeout(() => {
    const result = analyzeResume(resume, job);
    renderResults(result);
    analyzeButton.disabled = false;
    analyzeButton.querySelector("span").textContent = "Analyze my resume";
  }, 650);
});

function renderResults(result) {
  document.querySelector("#emptyResults").hidden = true;
  document.querySelector("#analysisResults").hidden = false;
  document.querySelector("#atsScore").textContent = result.ats_score;
  document.querySelector("#summary").textContent = result.summary;

  const scoreTitle = document.querySelector("#scoreTitle");
  if (result.ats_score >= 75) scoreTitle.textContent = "Strong match";
  else if (result.ats_score >= 55) scoreTitle.textContent = "Good match";
  else scoreTitle.textContent = "Needs improvement";

  const circumference = 326.73;
  document.querySelector("#scoreCircle").style.strokeDashoffset =
    circumference - (result.ats_score / 100) * circumference;

  document.querySelector("#strengthsList").innerHTML = result.strengths
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  document.querySelector("#missingKeywords").innerHTML = result.missing_keywords.length
    ? result.missing_keywords.map((item) => `<span class="keyword">${escapeHtml(item)}</span>`).join("")
    : `<span class="keyword">No major gaps detected</span>`;

  document.querySelector("#formattingList").innerHTML = result.formatting_issues
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  document.querySelector("#suggestionsList").innerHTML = result.improvement_suggestions
    .map((item, index) => `
      <div class="suggestion">
        <strong>Improvement ${index + 1} · ${escapeHtml(item.section)}</strong>
        <p class="original"><b>Before:</b> ${escapeHtml(item.original_text)}</p>
        <p class="improved"><b>Better:</b> ${escapeHtml(item.improved_text)}</p>
      </div>
    `).join("");

  if (window.innerWidth < 820) {
    document.querySelector("#analysisResults").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

updateControls();
