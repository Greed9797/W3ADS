import fs from "node:fs/promises";
import path from "node:path";

const DOCS_ROOT = path.join(process.cwd(), "docs", "connectors");

export type DocCategory = "geral" | "oauth" | "manual" | "reference";

export type DocEntry = {
  slug: string[];
  title: string;
  category: DocCategory;
  filePath: string;
};

const CATEGORY_LABELS: Record<DocCategory, string> = {
  geral: "Visão geral",
  oauth: "Conectores OAuth",
  manual: "Conectores manuais",
  reference: "Referência",
};

const CATEGORY_ORDER: DocCategory[] = ["geral", "oauth", "manual", "reference"];

const FILE_TITLE_OVERRIDES: Record<string, string> = {
  "README.md": "Início",
  "concepts.md": "Conceitos fundamentais",
  "faq-troubleshooting.md": "Erros comuns e troubleshooting",
};

function categoryFromRelativePath(relativePath: string): DocCategory {
  const segments = relativePath.split(path.sep);
  if (segments.length === 1) return "geral";
  if (segments[0] === "oauth") return "oauth";
  if (segments[0] === "manual") return "manual";
  if (segments[0] === "reference") return "reference";

  return "geral";
}

function slugFromRelativePath(relativePath: string): string[] {
  const noExt = relativePath.replace(/\.md$/, "");
  const segments = noExt.split(path.sep);

  if (segments.length === 1 && segments[0] === "README") {
    return [];
  }

  return segments;
}

async function extractTitle(
  content: string,
  fallback: string,
): Promise<string> {
  const match = content.match(/^#\s+(.+?)$/m);
  return match ? match[1].trim() : fallback;
}

async function collectMarkdownFiles(): Promise<DocEntry[]> {
  const entries: DocEntry[] = [];

  async function walk(dir: string, relativeBase = "") {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const absolute = path.join(dir, item.name);
      const relative = relativeBase
        ? path.join(relativeBase, item.name)
        : item.name;

      if (item.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }

      if (!item.name.endsWith(".md")) continue;

      const content = await fs.readFile(absolute, "utf8");
      const fallback =
        FILE_TITLE_OVERRIDES[item.name] ??
        item.name.replace(/\.md$/, "").replace(/-/g, " ");
      const title = await extractTitle(content, fallback);

      entries.push({
        slug: slugFromRelativePath(relative),
        title,
        category: categoryFromRelativePath(relative),
        filePath: absolute,
      });
    }
  }

  await walk(DOCS_ROOT);

  return entries;
}

export async function listDocs() {
  const entries = await collectMarkdownFiles();
  const grouped = new Map<DocCategory, DocEntry[]>();

  for (const entry of entries) {
    const bucket = grouped.get(entry.category) ?? [];
    bucket.push(entry);
    grouped.set(entry.category, bucket);
  }

  return CATEGORY_ORDER.flatMap((category) => {
    const docs = grouped.get(category) ?? [];
    if (docs.length === 0) return [];

    docs.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

    return [
      {
        category,
        label: CATEGORY_LABELS[category],
        docs,
      },
    ];
  });
}

export async function getDoc(slug: string[] | undefined) {
  const entries = await collectMarkdownFiles();
  const target = slug ?? [];
  const match = entries.find(
    (entry) =>
      entry.slug.length === target.length &&
      entry.slug.every((piece, idx) => piece === target[idx]),
  );

  if (!match) return null;

  const raw = await fs.readFile(match.filePath, "utf8");
  return {
    title: match.title,
    category: match.category,
    content: raw,
    slug: match.slug,
  };
}

export function docHref(slug: string[]) {
  if (slug.length === 0) return "/faq";
  return `/faq/${slug.join("/")}`;
}
