// ビルド後に dist/ を走査し、sw.template.js から dist/sw.js を作る。
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(relative(dist, full).split(sep).join("/"));
  }
})(dist);

const targets = files.filter((f) => f !== "sw.js").sort();
const hash = createHash("sha256");
for (const f of targets) {
  hash.update(f);
  hash.update(readFileSync(join(dist, f)));
}
const cacheName = `workshop-cue-${hash.digest("hex").slice(0, 10)}`;
const precache = ["./", ...targets.map((f) => `./${f}`)];

const template = readFileSync(new URL("../sw.template.js", import.meta.url), "utf8");
const out = template
  .replace("__CACHE_NAME__", cacheName)
  .replace("__PRECACHE__", JSON.stringify(precache, null, 2));
writeFileSync(join(dist, "sw.js"), out);
console.log(`sw.js generated: ${cacheName}, ${precache.length} files`);
