#!/usr/bin/env npx tsx
/**
 * Validates that event name string constants in events.rs match the keys
 * in BackendEvents in src/ipc/events.ts. Run via `pnpm check-events`.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Parse Rust constants ---

const rustSrc = readFileSync(
  resolve(root, "src-tauri/src/events.rs"),
  "utf8",
);

const rustConstants = new Set<string>();
for (const [, value] of rustSrc.matchAll(/pub const \w+: &str = "([^"]+)";/g)) {
  rustConstants.add(value);
}

// --- Parse TypeScript BackendEvents keys ---

const tsSrc = readFileSync(
  resolve(root, "src/ipc/events.ts"),
  "utf8",
);

const tsKeys = new Set<string>();

// Extract the BackendEvents block handling nested braces
const startMarker = "export type BackendEvents = {";
const startIdx = tsSrc.indexOf(startMarker);
if (startIdx === -1) {
  console.error("ERROR: Could not find BackendEvents in src/ipc/events.ts");
  process.exit(1);
}

let depth = 0;
let blockEnd = startIdx + startMarker.length - 1; // position of opening {
for (let i = blockEnd; i < tsSrc.length; i++) {
  if (tsSrc[i] === "{") depth++;
  else if (tsSrc[i] === "}") { depth--; if (depth === 0) { blockEnd = i; break; } }
}

const backendEventsBlock = tsSrc.slice(startIdx, blockEnd + 1);

// Match only the top-level keys: lines starting with "event::name":
for (const [, key] of backendEventsBlock.matchAll(/^\s+"([^"]+)":/gm)) {
  tsKeys.add(key);
}

// --- Cross-check ---

const missingInTs = [...rustConstants].filter((k) => !tsKeys.has(k));
const missingInRust = [...tsKeys].filter((k) => !rustConstants.has(k));

if (missingInTs.length === 0 && missingInRust.length === 0) {
  console.log(`check-events: OK (${rustConstants.size} events matched)`);
  process.exit(0);
}

if (missingInTs.length > 0) {
  console.error("ERROR: Rust constants missing from BackendEvents:");
  missingInTs.forEach((k) => console.error(`  - "${k}"`));
}

if (missingInRust.length > 0) {
  console.error("ERROR: BackendEvents keys missing from Rust events.rs:");
  missingInRust.forEach((k) => console.error(`  - "${k}"`));
}

process.exit(1);
