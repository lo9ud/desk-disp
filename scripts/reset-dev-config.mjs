#!/usr/bin/env node
/**
 * Wipe user config/themes/layouts for a clean dev cold-start.
 * Leaves builtin:* namespaces intact (they're re-seeded on next launch).
 * Run via: pnpm reset-dev-config
 */

import { rmSync, existsSync, walkSync } from "node:fs";
import { join } from "node:path";

const appDataDir =
  process.env.APPDATA ??
  join(process.env.HOME ?? "", "Library", "Application Support");

const baseDir = join(appDataDir, "desk-disp");

const targets = walkSync(baseDir, { withFileTypes: true });

let removed = 0;
for (const target of targets) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`removed: ${target}`);
    removed++;
  }
}

if (removed === 0) {
  console.log("nothing to reset — already clean");
} else {
  console.log(`reset-dev-config: ${removed} item(s) removed`);
}
