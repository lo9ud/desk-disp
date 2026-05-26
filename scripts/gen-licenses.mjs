import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const licenseChecker = require("license-checker-rseidelsohn");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = join(root, "src", "generated");
mkdirSync(outDir, { recursive: true });

/* npm licenses  */
const init = promisify(licenseChecker.init);

const packages = await init({
  start: root,
  production: true,
  excludeLicenses: "CC0-1.0,Unlicense,WTFPL",
  includeLicenseText: true,
  excludePackages: "desk-disp@0.1.0",
  customFormat: { licenseText: "" },
});

const npmEntries = Object.entries(packages).map(([key, info]) => {
  const atIndex = key.lastIndexOf("@");
  return {
    name: key.slice(0, atIndex),
    version: key.slice(atIndex + 1),
    license: String(info.licenses ?? "Unknown"),
    licenseText: info.licenseText ?? null,
    repository: info.repository ?? null,
    publisher: info.publisher ?? null,
    ecosystem: "npm",
  };
});

writeFileSync(
  join(outDir, "licenses-npm.json"),
  JSON.stringify(npmEntries, null, 2)
);
console.log(`[gen-licenses] npm: ${npmEntries.length} entries`);

// Rust/cargo licenses
const versionCheck = spawnSync("cargo", ["about", "--version"], {
  encoding: "utf8",
});
if (versionCheck.status !== 0) {
  console.error(
    "[gen-licenses] ERROR: cargo-about not found. Install: cargo install cargo-about"
  );
  process.exit(1);
}

const manifestPath = join(root, "src-tauri", "Cargo.toml");
const configPath = join(root, "src-tauri", "about.toml");
const cargoOutPath = join(outDir, "licenses-cargo-raw.json");

const result = spawnSync(
  "cargo",
  [
    "about",
    "generate",
    "--format",
    "json",
    "-c",
    configPath,
    "--manifest-path",
    manifestPath,
    "-o",
    cargoOutPath,
  ],
  { encoding: "utf8", maxBuffer: 100 * 1024 * 1024, cwd: root }
);

if (result.status !== 0) {
  console.error("[gen-licenses] cargo-about failed (exit", result.status, ")");
  if (result.stderr) console.error(result.stderr);
  if (result.error) console.error(result.error);
  process.exit(1);
}

let rawJson;
try {
  rawJson = JSON.parse(readFileSync(cargoOutPath, "utf8"));
} catch {
  console.error("[gen-licenses] Failed to parse cargo-about JSON output");
  process.exit(1);
}

// Build map: "name@version" → concatenated license texts (crates can have multiple)
const licenseTextMap = new Map();
for (const lic of rawJson.licenses ?? []) {
  for (const { crate: pkg } of lic.used_by ?? []) {
    const key = `${pkg.name}@${pkg.version}`;
    if (!licenseTextMap.has(key)) licenseTextMap.set(key, []);
    if (lic.text) licenseTextMap.get(key).push(lic.text);
  }
}

const cargoEntries = (rawJson.crates ?? [])
  .filter((c) => c.package.name !== "desk-disp")
  .map((c) => {
    const pkg = c.package;
    const key = `${pkg.name}@${pkg.version}`;
    const texts = licenseTextMap.get(key) ?? [];
    return {
      name: pkg.name,
      version: pkg.version,
      license: c.license ?? "Unknown",
      licenseText: texts.length > 0 ? texts.join("\n\n---\n\n") : null,
      repository: pkg.repository ?? null,
      publisher: pkg.authors?.[0] ?? null,
      ecosystem: "cargo",
    };
  });

writeFileSync(
  join(outDir, "licenses-cargo.json"),
  JSON.stringify(cargoEntries, null, 2)
);
console.log(`[gen-licenses] cargo: ${cargoEntries.length} entries`);
