import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");
const geoWasmDir = path.resolve(import.meta.dir, "..");
const pkgDir = path.join(geoWasmDir, "pkg");

const requiredFiles = [
  path.join(pkgDir, "package.json"),
  path.join(pkgDir, "geo_wasm.js"),
  path.join(pkgDir, "geo_wasm_bg.wasm"),
];
const expectedPackageName = "@ashtrail/geo-wasm";

const missingFiles = requiredFiles.filter((filePath) => !existsSync(filePath));
let needsRebuild = missingFiles.length > 0;

if (missingFiles.length === 0) {
  const packageJson = await Bun.file(path.join(pkgDir, "package.json")).json();
  if (packageJson.name === expectedPackageName) {
    console.log("geo-wasm artifacts already available.");
    process.exit(0);
  }

  needsRebuild = true;
  console.log(
    `geo-wasm package metadata is stale (found "${packageJson.name ?? "unknown"}", expected "${expectedPackageName}"). Rebuilding...`
  );
}

if (needsRebuild) {
  const versionCheck = spawnSync("wasm-pack", ["--version"], {
    cwd: repoRoot,
    stdio: "pipe",
    shell: true,
    encoding: "utf8",
  });

  if (versionCheck.error || versionCheck.status !== 0) {
    const stderr = versionCheck.stderr.trim();
    const detail = versionCheck.error?.message ?? (stderr.length > 0 ? stderr : "command not found");
    console.error("Missing geo-wasm build artifacts:");
    missingFiles.forEach((filePath) => console.error(`- ${path.relative(repoRoot, filePath)}`));
    console.error("");
    console.error("`wasm-pack` is required to rebuild packages/geo-wasm/pkg.");
    console.error(`Details: ${detail}`);
    process.exit(1);
  }

  if (missingFiles.length > 0) {
    console.log("Rebuilding geo-wasm artifacts with wasm-pack...");
  }

  const build = spawnSync(
    "wasm-pack",
    ["build", "--target", "web", "--out-dir", "pkg", "--scope", "ashtrail"],
    {
      cwd: geoWasmDir,
      stdio: "inherit",
      shell: true,
    }
  );

  if (build.error || build.status !== 0) {
    console.error("Failed to rebuild geo-wasm artifacts.");
    if (build.error) {
      console.error(build.error.message);
    }
    process.exit(build.status ?? 1);
  }

  const remainingMissingFiles = requiredFiles.filter((filePath) => !existsSync(filePath));

  if (remainingMissingFiles.length > 0) {
    console.error("wasm-pack completed but required geo-wasm artifacts are still missing:");
    remainingMissingFiles.forEach((filePath) => console.error(`- ${path.relative(repoRoot, filePath)}`));
    process.exit(1);
  }

  console.log("geo-wasm artifacts are ready.");
}
