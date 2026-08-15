import { StreamName } from "../ffi_types";
import { StreamEvents } from "../ipc/events";

export type MockStreamSpec<K extends StreamName> = {
  /** ms between frames, or "raf" for animation-frame cadence. */
  cadence: number | "raf";
  generate: (tMs: number) => StreamEvents[K];
};

export type MockStreams = { [K in StreamName]: MockStreamSpec<K> };

const TAU = Math.PI * 2;

/** 0..1 sinusoid. Pure over t: no Math.random anywhere in this module, so
 *  output is fully determined by the injected clock. */
function wave(t: number, periodMs: number, phase = 0): number {
  return 0.5 + 0.5 * Math.sin((TAU * t) / periodMs + phase);
}

const GiB = 1024 ** 3;
const CORE_COUNT = 8;

const TRACKS = [
  {
    title: "Weightless Horizon",
    artist: "The Mock Ensemble",
    album: "Placeholder Dreams",
    duration: 214_000,
  },
  {
    title: "Synthetic Sunrise",
    artist: "Data Stream",
    album: "Preview Mode",
    duration: 187_000,
  },
  {
    title: "Grid Lines",
    artist: "The Mock Ensemble",
    album: "Placeholder Dreams",
    duration: 246_000,
  },
];

const VISUALIZER_BINS = 4096;

export const MOCK_STREAMS: MockStreams = {
  cpu: {
    cadence: 1000,
    generate: (t) => {
      const cores = Array.from({ length: CORE_COUNT }, (_, i) => ({
        name: `Core ${i}`,
        frequency: BigInt(3400 + Math.round(600 * wave(t, 15_000, i))),
        usage:
          100 *
          (0.08 + 0.25 * wave(t, 9000, i * 1.7) + 0.35 * wave(t, 3100, i * 0.9)),
      }));
      return {
        global_usage: cores.reduce((s, c) => s + c.usage, 0) / CORE_COUNT,
        processors: [{ brand: "Mock Ryzen 9 9900X", cores }],
        total_physical_cores: CORE_COUNT,
        total_logical_cores: CORE_COUNT * 2,
      };
    },
  },

  memory: {
    cadence: 1000,
    generate: (t) => {
      const total = 32 * GiB;
      const swapTotal = 8 * GiB;
      return {
        used: BigInt(
          Math.round(total * (0.45 + 0.12 * wave(t, 20_000) + 0.03 * wave(t, 3700, 2))),
        ),
        total: BigInt(total),
        swap_used: BigInt(Math.round(swapTotal * (0.1 + 0.05 * wave(t, 45_000, 1)))),
        swap_total: BigInt(swapTotal),
      };
    },
  },

  disks: {
    cadence: 2000,
    generate: (t) => [
      {
        name: "Mock SSD",
        mount_point: "C:\\",
        file_system: "NTFS",
        kind: "SSD",
        total_space: BigInt(931 * GiB),
        available_space: BigInt(
          Math.round(931 * GiB * (0.34 + 0.02 * wave(t, 60_000))),
        ),
      },
      {
        name: "Mock Archive",
        mount_point: "D:\\",
        file_system: "NTFS",
        kind: "HDD",
        total_space: BigInt(3726 * GiB),
        available_space: BigInt(
          Math.round(3726 * GiB * (0.61 + 0.01 * wave(t, 90_000, 3))),
        ),
      },
    ],
  },

  networks: {
    cadence: 1000,
    generate: (t) => [
      {
        name: "Mock Ethernet",
        received: BigInt(
          Math.round(6e6 * (0.2 + 0.6 * wave(t, 8000) * wave(t, 2300, 1))),
        ),
        transmitted: BigInt(
          Math.round(8e5 * (0.15 + 0.5 * wave(t, 11_000, 2))),
        ),
        total_received: BigInt(Math.floor(t * 700)),
        total_transmitted: BigInt(Math.floor(t * 90)),
        mac_address: "00:11:22:33:44:55",
      },
    ],
  },

  media: {
    cadence: 500,
    generate: (t) => {
      // Piecewise track rotation: pure functions can fabricate "state".
      const cycle = TRACKS.reduce((s, x) => s + x.duration, 0);
      let tt = t % cycle;
      let track = TRACKS[TRACKS.length - 1];
      for (const candidate of TRACKS) {
        if (tt < candidate.duration) {
          track = candidate;
          break;
        }
        tt -= candidate.duration;
      }
      return {
        active: true,
        playing: true,
        title: track.title,
        artist: track.artist,
        album: track.album,
        album_art_b64: null,
        position_ms: BigInt(Math.floor(tt)),
        duration_ms: BigInt(track.duration),
      };
    },
  },

  visualizer: {
    cadence: "raf",
    generate: (t) =>
      Array.from({ length: VISUALIZER_BINS }, (_, i) => {
        // 20Hz → 20kHz, log-spaced, bass-heavy envelope. Everything shaped
        // by fractional position so the curve holds at any bin count.
        const f = i / VISUALIZER_BINS;
        const lo = 20 * Math.pow(1000, f);
        const hi = 20 * Math.pow(1000, (i + 1) / VISUALIZER_BINS);
        const envelope = 0.35 + 0.65 * Math.exp(-f * 4);
        const pulse =
          0.55 * wave(t, 1800, f * 26) * wave(t, 430, f * 11) +
          0.25 * wave(t, 7300, f * 59);
        return {
          freq_lo: lo,
          freq_hi: hi,
          magnitude: Math.min(1, (0.06 + pulse) * envelope),
        };
      }),
  },
};
