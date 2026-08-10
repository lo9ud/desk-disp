#!/usr/bin/env node
/**
 * Watches this app's OS-level process memory over time and periodically takes
 * JS heap snapshots of its WebView2 page(s), to help track down a slow leak
 * that eventually OOMs.
 *
 * Every interval this:
 *   1. Finds `desk-disp.exe` and any `msedgewebview2.exe` processes descended
 *      from it (browser/renderer/gpu/utility — WebView2 is multi-process),
 *      and appends their working-set/private-bytes to a JSONL log. This part
 *      always works and needs no setup — it tells you WHICH process is
 *      growing (native host vs. a specific webview subprocess).
 *   2. If the WebView2 DevTools protocol port is reachable, takes a
 *      `.heapsnapshot` of every open page via HeapProfiler.takeHeapSnapshot.
 *      This tells you WHAT is retained (load it in Chrome/Edge DevTools →
 *      Memory tab → Load, and diff two snapshots to spot what keeps growing).
 *
 * Heap snapshots require the app to be launched with WebView2's remote
 * debugging port enabled (must be set before the webview process starts):
 *
 *   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
 *   pnpm tauri dev
 *
 * Without that, the process-memory log still runs fine — you just won't get
 * heap snapshots, only the growth timeline.
 *
 * Usage:
 *   pnpm watch-mem [-- --interval 5] [--port 9222] [--out mem-dumps] [--once] [--keep 50]
 *
 * Windows-only (shells out to PowerShell / Win32_Process). Ctrl+C to stop.
 */

import { mkdirSync, appendFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    port: 9222,
    intervalMin: 5,
    out: resolve(__dirname, "..", "mem-dumps"),
    once: false,
    keep: 50,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") args.port = Number(argv[++i]);
    else if (a === "--interval") args.intervalMin = Number(argv[++i]);
    else if (a === "--out") args.out = resolve(argv[++i]);
    else if (a === "--once") args.once = true;
    else if (a === "--keep") args.keep = Number(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`webview-memory-snapshot.mjs

  --port <n>       WebView2 remote debugging port to try connecting to (default 9222)
  --interval <min> minutes between captures (default 5)
  --out <dir>      output directory (default ./mem-dumps)
  --once           capture a single round and exit
  --keep <n>       max .heapsnapshot files to retain, oldest pruned first (default 50)
  --help           show this message`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fileTimestamp() {
  return new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
}

function sanitizeForFilename(str) {
  return (str ?? "").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "target";
}

function classifyRole(name, commandLine) {
  if (name === "desk-disp.exe") return "app";
  const match = /--type=([a-z-]+)/.exec(commandLine ?? "");
  return match ? match[1] : "browser"; // WebView2's main process carries no --type flag
}

/** Queries desk-disp.exe + any msedgewebview2.exe descendants of it. */
function getRelevantProcesses() {
  const psScript = `
    $procs = Get-CimInstance Win32_Process -Filter "Name='desk-disp.exe' OR Name='msedgewebview2.exe'" |
      ForEach-Object {
        $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
        [PSCustomObject]@{
          Pid = $_.ProcessId
          ParentPid = $_.ParentProcessId
          Name = $_.Name
          CommandLine = $_.CommandLine
          WorkingSetBytes = if ($p) { $p.WorkingSet64 } else { $null }
          PrivateBytes = if ($p) { $p.PrivateMemorySize64 } else { $null }
        }
      }
    ConvertTo-Json -InputObject @($procs) -Compress
  `;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psScript], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout?.trim()) return [];

  let list;
  try {
    const raw = JSON.parse(result.stdout);
    list = Array.isArray(raw) ? raw : [raw];
  } catch {
    console.error(`[mem-snapshot] failed to parse PowerShell output: ${result.stdout.slice(0, 200)}`);
    return [];
  }

  const rootPids = new Set(list.filter((p) => p.Name === "desk-disp.exe").map((p) => p.Pid));
  if (rootPids.size === 0) return [];

  // Grow to include msedgewebview2.exe descendants (browser -> renderer/gpu/utility children).
  const relevantPids = new Set(rootPids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of list) {
      if (!relevantPids.has(p.Pid) && relevantPids.has(p.ParentPid)) {
        relevantPids.add(p.Pid);
        grew = true;
      }
    }
  }

  return list
    .filter((p) => relevantPids.has(p.Pid))
    .map((p) => ({
      pid: p.Pid,
      parentPid: p.ParentPid,
      name: p.Name,
      role: classifyRole(p.Name, p.CommandLine),
      workingSetBytes: p.WorkingSetBytes,
      privateBytes: p.PrivateBytes,
    }));
}

function snapshotOneTarget(page, outDir) {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const chunks = [];
    let msgId = 1;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("timed out waiting for heap snapshot"));
    }, 60_000);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: msgId++, method: "HeapProfiler.enable" }));
    });

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === "HeapProfiler.addHeapSnapshotChunk") {
        chunks.push(msg.params.chunk);
      } else if (msg.id === 1) {
        // enable() ack -> kick off the snapshot
        ws.send(JSON.stringify({ id: msgId++, method: "HeapProfiler.takeHeapSnapshot", params: { reportProgress: false } }));
      } else if (msg.id === 2) {
        clearTimeout(timeout);
        const name = sanitizeForFilename(page.title || page.id);
        const file = join(outDir, `${fileTimestamp()}__${name}.heapsnapshot`);
        writeFileSync(file, chunks.join(""));
        ws.close();
        resolvePromise(file);
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("websocket error"));
    });
  });
}

async function captureHeapSnapshots(port, outDir) {
  let targets;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    targets = await res.json();
  } catch (err) {
    return { ok: false, reason: `CDP unreachable on port ${port} (${err.message})` };
  }

  const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (pages.length === 0) return { ok: false, reason: "no page targets found" };

  const written = [];
  for (const page of pages) {
    try {
      written.push(await snapshotOneTarget(page, outDir));
    } catch (err) {
      console.error(`[mem-snapshot] heap snapshot failed for "${page.title || page.id}": ${err.message}`);
    }
  }
  return { ok: true, written };
}

/** Keeps only the `keep` most-recently-written .heapsnapshot files in outDir. */
function pruneSnapshots(outDir, keep) {
  const files = readdirSync(outDir)
    .filter((f) => f.endsWith(".heapsnapshot"))
    .map((f) => {
      const full = join(outDir, f);
      return { full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const f of files.slice(keep)) {
    unlinkSync(f.full);
    console.log(`[mem-snapshot] pruned old snapshot ${f.full}`);
  }
}

async function tick(args, logFile) {
  const ts = new Date().toISOString();

  const procs = getRelevantProcesses();
  if (procs.length === 0) {
    console.log(`[${ts}] no desk-disp / msedgewebview2 processes found — is the app running?`);
  } else {
    for (const p of procs) appendFileSync(logFile, JSON.stringify({ ts, ...p }) + "\n");
    const totalMB = procs.reduce((sum, p) => sum + (p.workingSetBytes ?? 0), 0) / 1024 / 1024;
    const top = [...procs].sort((a, b) => (b.workingSetBytes ?? 0) - (a.workingSetBytes ?? 0))[0];
    console.log(
      `[${ts}] ${procs.length} process(es), total working set ${totalMB.toFixed(1)} MB — ` +
        `top: ${top.role} pid ${top.pid} @ ${(top.workingSetBytes / 1024 / 1024).toFixed(1)} MB`
    );
  }

  const heap = await captureHeapSnapshots(args.port, args.out);
  if (heap.ok) {
    for (const f of heap.written) console.log(`[${ts}] heap snapshot -> ${f}`);
    pruneSnapshots(args.out, args.keep);
  } else {
    console.log(`[${ts}] heap snapshot skipped (${heap.reason})`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  mkdirSync(args.out, { recursive: true });
  const logFile = join(args.out, "process-memory.jsonl");

  console.log(`[mem-snapshot] watching desk-disp + msedgewebview2 every ${args.intervalMin} min`);
  console.log(`[mem-snapshot] output dir: ${args.out}`);
  console.log(
    `[mem-snapshot] heap snapshots need WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=${args.port}" ` +
      `set before launching the app — without it you still get the process-memory log`
  );

  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    console.log("\n[mem-snapshot] stopping...");
  });

  do {
    await tick(args, logFile);
    if (args.once || stopping) break;
    await sleep(args.intervalMin * 60_000);
  } while (!stopping);
}

main();
