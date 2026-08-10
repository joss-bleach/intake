#!/usr/bin/env node
// Generates taste/index.html from taste/entries/*.md and taste/directions.md.
// Plain Node, no dependencies — run with `node taste/build.mjs`.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TASTE_DIR = dirname(fileURLToPath(import.meta.url));
const ENTRIES_DIR = join(TASTE_DIR, "entries");
const DIRECTIONS_FILE = join(TASTE_DIR, "directions.md");
const OUT_FILE = join(TASTE_DIR, "index.html");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Minimal frontmatter parser: `key: value` lines between leading `---` markers.
// Handles scalars, `null`, and `[a, b, c]` inline arrays — the only shapes this schema uses.
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const [, fmText, body] = match;
  const data = {};
  for (const line of fmText.split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value === "null" || value === "") {
      data[key] = null;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { data, body: body.trim() };
}

// Minimal markdown -> HTML: `## heading` and blank-line-separated paragraphs. That's all entry
// bodies use (see taste/README.md's template), so nothing richer is needed here.
function markdownToHtml(md) {
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      if (block.startsWith("## ")) return `<h3>${escapeHtml(block.slice(3))}</h3>`;
      return `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

function loadDirections() {
  if (!existsSync(DIRECTIONS_FILE)) return new Map();
  const text = readFileSync(DIRECTIONS_FILE, "utf8");
  const directions = new Map();
  const headingRe = /^## (.+)$/gm;
  const matches = [...text.matchAll(headingRe)];
  for (let i = 0; i < matches.length; i++) {
    const slug = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const description = text.slice(start, end).trim();
    directions.set(slug, description);
  }
  return directions;
}

function loadEntries() {
  if (!existsSync(ENTRIES_DIR)) return [];
  return readdirSync(ENTRIES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(ENTRIES_DIR, file), "utf8");
      const { data, body } = parseFrontmatter(raw);
      return {
        slug: file.replace(/\.md$/, ""),
        link: data.link ?? null,
        image: data.image ?? null,
        direction: data.direction ?? null,
        screens: data.screens ?? [],
        added: data.added ?? null,
        bodyHtml: markdownToHtml(body),
      };
    });
}

function renderEntry(entry) {
  const media = entry.image
    ? `<img src="entries/${escapeHtml(entry.image)}" alt="${escapeHtml(entry.slug)}" loading="lazy">`
    : "";
  const linkHtml = entry.link
    ? `<a class="entry-link" href="${escapeHtml(entry.link)}" target="_blank" rel="noopener">${escapeHtml(entry.link)}</a>`
    : "";
  const screenChips = entry.screens
    .map((s) => `<span class="chip" data-screen="${escapeHtml(s)}">${escapeHtml(s)}</span>`)
    .join("");
  return `
    <article class="entry" data-screens="${escapeHtml(entry.screens.join(","))}">
      ${media}
      <div class="entry-body">
        <div class="entry-meta">${linkHtml}${entry.added ? `<span class="added">${escapeHtml(entry.added)}</span>` : ""}</div>
        ${entry.bodyHtml}
        <div class="chips">${screenChips}</div>
      </div>
    </article>`;
}

function render(entries, directions) {
  const bySlug = new Map();
  for (const e of entries) {
    const key = e.direction ?? "__unsorted__";
    if (!bySlug.has(key)) bySlug.set(key, []);
    bySlug.get(key).push(e);
  }

  const orderedSlugs = [...directions.keys()].filter((s) => bySlug.has(s));
  for (const slug of bySlug.keys()) {
    if (slug !== "__unsorted__" && !orderedSlugs.includes(slug)) orderedSlugs.push(slug);
  }
  if (bySlug.has("__unsorted__")) orderedSlugs.push("__unsorted__");

  const allScreens = [...new Set(entries.flatMap((e) => e.screens))].sort();

  const sections = orderedSlugs.length
    ? orderedSlugs
        .map((slug) => {
          const title = slug === "__unsorted__" ? "Unsorted" : slug;
          const description = slug === "__unsorted__" ? "Not yet assigned to a direction." : directions.get(slug) ?? "";
          const entryHtml = bySlug.get(slug).map(renderEntry).join("\n");
          return `
      <section class="direction" id="${escapeHtml(slug)}">
        <h2>${escapeHtml(title)}</h2>
        ${description ? `<p class="direction-desc">${escapeHtml(description)}</p>` : ""}
        <div class="entries">${entryHtml}</div>
      </section>`;
        })
        .join("\n")
    : `<p class="empty">No entries yet. See <code>taste/README.md</code> for how to add one.</p>`;

  const filterButtons = allScreens
    .map((s) => `<button class="filter-btn" data-screen="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Intake — taste library</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem 6rem; line-height: 1.5; }
  h1 { margin-bottom: 0.25rem; }
  .subtitle { opacity: 0.7; margin-top: 0; }
  .filters { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1.5rem 0; }
  .filter-btn { border: 1px solid currentColor; background: none; color: inherit; border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.85rem; cursor: pointer; opacity: 0.7; }
  .filter-btn.active { opacity: 1; font-weight: 600; }
  .direction { margin-top: 3rem; border-top: 1px solid currentColor; border-color: color-mix(in srgb, currentColor 15%, transparent); padding-top: 1.5rem; }
  .direction-desc { opacity: 0.75; max-width: 60ch; }
  .entries { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; margin-top: 1rem; }
  .entry { border: 1px solid color-mix(in srgb, currentColor 15%, transparent); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
  .entry img { width: 100%; height: 160px; object-fit: cover; display: block; }
  .entry-body { padding: 0.75rem 1rem 1rem; }
  .entry-meta { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.8rem; opacity: 0.7; margin-bottom: 0.25rem; flex-wrap: wrap; }
  .entry-link { color: inherit; word-break: break-all; }
  .entry-body h3 { font-size: 0.95rem; margin: 0.5rem 0 0.15rem; }
  .entry-body p { margin: 0.15rem 0; font-size: 0.9rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.6rem; }
  .chip { font-size: 0.75rem; background: color-mix(in srgb, currentColor 10%, transparent); border-radius: 6px; padding: 0.1rem 0.5rem; }
  .empty { opacity: 0.6; margin-top: 2rem; }
  .entry.hidden { display: none; }
</style>
</head>
<body>
  <h1>Taste library</h1>
  <p class="subtitle">Design inspiration for Intake, grouped by direction. See <code>taste/README.md</code> for how to add to this.</p>
  ${allScreens.length ? `<div class="filters" id="filters"><button class="filter-btn active" data-screen="">All</button>${filterButtons}</div>` : ""}
  <div id="sections">${sections}</div>
  <script>
    const buttons = document.querySelectorAll(".filter-btn");
    const entries = document.querySelectorAll(".entry");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const screen = btn.dataset.screen;
        entries.forEach((entry) => {
          const screens = (entry.dataset.screens || "").split(",");
          entry.classList.toggle("hidden", screen !== "" && !screens.includes(screen));
        });
      });
    });
  </script>
</body>
</html>
`;
}

const entries = loadEntries();
const directions = loadDirections();
writeFileSync(OUT_FILE, render(entries, directions));
console.log(`Wrote ${OUT_FILE} (${entries.length} entr${entries.length === 1 ? "y" : "ies"}, ${directions.size} direction(s))`);
