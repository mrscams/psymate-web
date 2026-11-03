#!/usr/bin/env node
// Génère docs/api-reference.md (Markdown par tag) et docs/api.html (Redoc) à partir du contrat OpenAPI.
// Usage : node tools/api-reference.mjs <openapi.json>
//   Le JSON s'obtient depuis l'API locale : curl http://localhost:8080/v3/api-docs -o /tmp/openapi.json
//   (docs/contract/openapi.yaml est le même contrat ; Node n'a pas de parseur YAML sans dépendance.)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("usage : node tools/api-reference.mjs <openapi.json>");
  process.exit(1);
}
const doc = JSON.parse(readFileSync(src, "utf8"));
const schemas = doc.components?.schemas ?? {};

const ref = (s) => (s?.$ref ? s.$ref.split("/").pop() : null);
const typeOf = (s) => {
  if (!s) return "";
  const r = ref(s);
  if (r) return `[${r}](#schema-${r.toLowerCase()})`;
  if (s.type === "array") return `${typeOf(s.items)}[]`;
  if (s.enum) return s.enum.map((v) => `\`${v}\``).join(" \\| ");
  return s.format ? `${s.type} (${s.format})` : s.type ?? "object";
};
const esc = (t) => (t ?? "").replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();

const byTag = new Map();
for (const [path, item] of Object.entries(doc.paths)) {
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const op = item[method];
    if (!op) continue;
    const tag = op.tags?.[0] ?? "autres";
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push({ path, method, op });
  }
}

let md = `# Référence de l'API PsyMate\n\nGénéré depuis le contrat OpenAPI (\`${doc.info.title}\`, info.version ${doc.info.version}). ${Object.keys(doc.paths).length} chemins, ${Object.keys(schemas).length} schémas.\n\nToutes les routes \`/api/**\` exigent une session (cookie posé par \`POST /api/auth/login\`), sauf celles marquées publiques dans leur description (\`/api/auth/*\`, \`/api/public/**\`, \`/api/me/appeal\`, \`/api/me/export\`). Erreurs : \`application/problem+json\` avec \`code\` et \`errors[]\`.\n\n## Sommaire\n\n`;
const anchor = (t) =>
  t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-");
for (const tag of [...byTag.keys()].sort()) md += `- [${tag}](#tag-${anchor(tag)}) (${byTag.get(tag).length})\n`;

for (const tag of [...byTag.keys()].sort()) {
  md += `\n## <a id="tag-${anchor(tag)}"></a>${tag}\n`;
  for (const { path, method, op } of byTag.get(tag).sort((a, b) => a.path.localeCompare(b.path))) {
    md += `\n### \`${method.toUpperCase()} ${path}\`\n\n`;
    if (op.summary) md += `**${esc(op.summary)}**\n\n`;
    if (op.description) md += `${op.description.trim()}\n\n`;
    md += `operationId : \`${op.operationId}\`\n\n`;
    const params = op.parameters ?? [];
    if (params.length) {
      md += `| Paramètre | Dans | Type | Requis | Description |\n| --- | --- | --- | --- | --- |\n`;
      for (const p of params) md += `| \`${p.name}\` | ${p.in} | ${typeOf(p.schema)} | ${p.required ? "oui" : "non"} | ${esc(p.description)} |\n`;
      md += "\n";
    }
    const body = op.requestBody?.content;
    if (body) {
      const [ct, c] = Object.entries(body)[0];
      md += `Corps (\`${ct}\`) : ${typeOf(c.schema)}\n\n`;
    }
    md += `| Réponse | Contenu | Description |\n| --- | --- | --- |\n`;
    for (const [code, r] of Object.entries(op.responses ?? {})) {
      const c = r.content ? Object.entries(r.content)[0] : null;
      md += `| ${code} | ${c ? typeOf(c[1].schema) + " (" + c[0] + ")" : "—"} | ${esc(r.description)} |\n`;
    }
  }
}

md += `\n## Schémas\n`;
for (const name of Object.keys(schemas).sort()) {
  const s = schemas[name];
  md += `\n### <a id="schema-${name.toLowerCase()}"></a>${name}\n\n`;
  if (s.description) md += `${s.description.trim()}\n\n`;
  const props = s.properties ?? {};
  const required = new Set(s.required ?? []);
  if (Object.keys(props).length) {
    md += `| Champ | Type | Requis | Description |\n| --- | --- | --- | --- |\n`;
    for (const [p, ps] of Object.entries(props)) md += `| \`${p}\` | ${typeOf(ps)} | ${required.has(p) ? "oui" : "non"} | ${esc(ps.description)} |\n`;
  } else if (s.enum) {
    md += `Valeurs : ${s.enum.map((v) => `\`${v}\``).join(", ")}\n`;
  } else {
    md += `Type : ${typeOf(s)}\n`;
  }
}

mkdirSync("docs", { recursive: true });
writeFileSync("docs/api-reference.md", md, "utf8");

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>PsyMate API</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;padding:0}</style></head>
<body><div id="redoc"></div>
<script src="https://cdn.jsdelivr.net/npm/redoc@2.5.0/bundles/redoc.standalone.js"></script>
<script>Redoc.init(${JSON.stringify(doc)}, { hideDownloadButton: false }, document.getElementById("redoc"));</script>
</body></html>`;
writeFileSync("docs/api.html", html, "utf8");
console.log(`docs/api-reference.md (${md.length} caractères) et docs/api.html écrits ; ${byTag.size} tags.`);
