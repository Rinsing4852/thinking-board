import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "apps/web/dist");
if (!existsSync(join(output, "index.html"))) throw new Error("Build the frontend before packaging its source");
const stage = mkdtempSync(join(tmpdir(), "thinking-board-web-source-"));
const source = join(stage, "thinking-board-frontend");
const dependencies = ["@lichess-org/chessground", "chess.js", "react", "react-dom", "scheduler"];
const versionOf = name => JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version;
const dependencySources = {
  react: `https://github.com/facebook/react/tree/v${versionOf("react")}`,
  "react-dom": `https://github.com/facebook/react/tree/v${versionOf("react-dom")}`,
  scheduler: `https://github.com/facebook/react/tree/v${versionOf("react")}/packages/scheduler`,
  "chess.js": `https://github.com/jhlywa/chess.js/tree/v${versionOf("chess.js")}`,
  chessground: { version: versionOf("@lichess-org/chessground"), source: "vendor/@lichess-org/chessground/src" },
};

try {
  // Only these paths are eligible. Never archive the workspace or installation.
  for (const entry of ["apps/web/src", "apps/web/public", "apps/web/index.html", "apps/web/vite.config.ts",
    "apps/web/tsconfig.json", "apps/web/LICENSING.md", "packages/contracts/src", "package.json", "package-lock.json",
    "tsconfig.json", "LICENSE", "THIRD_PARTY_LICENSES.md", "scripts/package-web-source.mjs"]) {
    const target = join(source, entry);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, entry), target, { recursive: true, filter: path => {
      if (lstatSync(path).isSymbolicLink()) throw new Error(`Source archive refuses symlinks: ${path}`);
      if (/^\.env(?:\.|$)|^(?:data|backups|\.git)$|\.(?:pgn|sqlite3?|db)$/i.test(basename(path)))
        throw new Error(`Private-data path is not permitted in frontend source: ${path}`);
      return true;
    } });
  }
  let notices = `${readFileSync(join(root, "LICENSE"), "utf8")}\n\n${readFileSync(join(root, "THIRD_PARTY_LICENSES.md"), "utf8")}`;
  for (const name of dependencies) {
    const installed = join(root, "node_modules", name);
    cpSync(installed, join(source, "vendor", name), { recursive: true, filter: path => {
      if (lstatSync(path).isSymbolicLink()) throw new Error(`Dependency source refuses symlinks: ${path}`);
      return true;
    } });
    const licence = ["LICENSE", "LICENSE.txt", "LICENSE.md"].find(file => existsSync(join(installed, file)));
    if (!licence) throw new Error(`Missing licence for ${name}`);
    notices += `\n\n--- ${name} ${versionOf(name)} ---\n${readFileSync(join(installed, licence), "utf8")}`;
  }
  mkdirSync(join(output, "source"), { recursive: true });
  const manifest = `${JSON.stringify(dependencySources, null, 2)}\n`;
  writeFileSync(join(source, "dependency-sources.json"), manifest);
  writeFileSync(join(source, "README.md"), readFileSync(join(root, "apps/web/LICENSING.md")));
  writeFileSync(join(output, "source/dependency-sources.json"), manifest);
  writeFileSync(join(output, "legal/notices.txt"), notices);
  execFileSync("tar", ["-czf", join(output, "source/thinking-board-frontend.tar.gz"), "-C", stage, "thinking-board-frontend"]);
  console.log("Packaged this build's frontend source and licence notices (no user-data paths).");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
