import { StreamName } from "../ffi_types";
import { StreamEvents } from "../runtime/events";
import { MOCK_ALBUM_ART } from "./mockAlbumArt";

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

/**
 * Art is keyed per *track*, not per album, even though the two Mock Ensemble
 * tracks share one. Only ever one track is on screen at a time, so the shared
 * cover would be unobservable, while three distinct ones give the gallery more
 * variety — see the note on rotation below for why that variety is spread
 * across sessions rather than seen within one.
 */
const TRACKS = [
  {
    title: "Weightless Horizon",
    artist: "The Mock Ensemble",
    album: "Placeholder Dreams",
    duration: 214_000,
    art: MOCK_ALBUM_ART.weightlessHorizon,
  },
  {
    title: "Synthetic Sunrise",
    artist: "Data Stream",
    album: "Preview Mode",
    duration: 187_000,
    art: MOCK_ALBUM_ART.syntheticSunrise,
  },
  {
    title: "Grid Lines",
    artist: "The Mock Ensemble",
    album: "Placeholder Dreams",
    duration: 246_000,
    art: MOCK_ALBUM_ART.gridLines,
  },
];

/* ---- visualizer ---------------------------------------------------------- */

/**
 * The visualizer generator is the one mock that cannot invent its own output
 * scale, because `FrequencyReading.magnitude` is not "loudness 0..1".
 * `FFTStream::get` in [src-tauri/src/media/mod.rs] **peak-normalises every
 * frame**: the loudest bin is always 1.0 and every other bin is its distance
 * below that peak, squashed through a 120 dB log map. A bin 30 dB down still
 * reads ~0.7. The widget's `scaleValue` then re-expands that compressed range
 * from a 0.4 cutoff, so anything under ~0.79 is visually zero.
 *
 * That is why plausible-looking 0..1 numbers render as a flat line: 0.3 is not
 * a quiet bar, it is 70 dB down. So rather than fabricate magnitudes, this
 * fabricates the *linear* spectrum an FFT would see and runs it through the
 * same weighting → log map → peak-normalise steps the backend does. Fidelity
 * falls out of the shared arithmetic instead of being hand-tuned into the
 * output, and stays correct if the widget's scaling is ever retuned.
 */
const VISUALIZER_BINS = 64; // FFTStream::create_log_frequency_bins(_, _, 64)
const VISUALIZER_FRAME_MS = 33; // spawn_visualizer_loop(.., from_millis(33))
/** `FFTStream::decay_coeff` — exp(-1/(0.3 * 48000/4096)), applied per frame. */
const VISUALIZER_DECAY = 0.753;
/** Frames of history the decay tail looks back over; 0.753^6 ≈ 0.18. */
const VISUALIZER_TAIL = 6;
/** Playback level, as peak weighted magnitude. Only weakly affects the picture:
 *  peak-normalisation divides it back out, leaving it to set the log map's
 *  compression, which barely moves between a loud and a quiet source. */
const VISUALIZER_GAIN = 0.5;

/** Mirror of `FFTStream::a_weighting_response`. ~-30 dB at 55 Hz, 0 at 1 kHz. */
function aWeighting(freq: number): number {
  const f2 = freq * freq;
  const num = 12194 ** 2 * f2 * f2;
  const den =
    (f2 + 20.6 ** 2) *
    Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
    (f2 + 12194 ** 2);
  return 10 ** ((20 * Math.log10(num / den) + 2) / 20);
}

/** 20 Hz → 20 kHz log-spaced bin edges, as `create_log_frequency_bins` lays
 *  them out. Edges and weights are fixed, so they are built once. */
const VISUALIZER_BANDS = Array.from({ length: VISUALIZER_BINS }, (_, i) => {
  const freq_lo = 20 * Math.pow(1000, i / VISUALIZER_BINS);
  const freq_hi = 20 * Math.pow(1000, (i + 1) / VISUALIZER_BINS);
  return {
    freq_lo,
    freq_hi,
    /** where the synthetic spectrum is sampled */
    center: Math.sqrt(freq_lo * freq_hi),
    /** the backend weights by the *arithmetic* mean of the edges — keep that */
    weight: aWeighting((freq_lo + freq_hi) / 2),
  };
});

/** Repeating percussive envelope: instant attack, exponential decay. Safe for
 *  negative t, which the decay tail reaches for near the clock origin. */
function hit(t: number, periodMs: number, decayMs: number, offsetMs = 0): number {
  const phase = (((t - offsetMs) % periodMs) + periodMs) % periodMs;
  return Math.exp(-phase / decayMs);
}

/** Log-normal band: 1.0 at `centerHz`, falling off over `widthOct` octaves. */
function band(freq: number, centerHz: number, widthOct: number): number {
  const d = Math.log2(freq / centerHz) / widthOct;
  return Math.exp(-d * d);
}

/** Step through a repeating sequence; floor-mod so negative t stays in range. */
function pick<T>(seq: readonly T[], index: number): T {
  return seq[((index % seq.length) + seq.length) % seq.length];
}

const BEAT_MS = 500; // 120 BPM
const BAR_MS = 4 * BEAT_MS;
const PHRASE_MS = 4 * BAR_MS;
const BASS_HZ = [55, 73.42, 82.41, 61.74];
const PAD_HZ = [220, 293.66, 329.63, 246.94];
const ARP_HZ = [440, 554.37, 659.25, 880, 659.25, 554.37];

/**
 * Linear magnitude of a fabricated track at `freq`, before A-weighting — the
 * quantity the real FFT would produce. A pink-ish -6.5 dB/octave tilt with a
 * sub-bass rolloff carries the broadband shape; the parts sit on top of it as
 * multiplicative boosts, so a level of 3 is "+12 dB in this band right now".
 */
function synthSpectrum(freq: number, t: number): number {
  const bassF = pick(BASS_HZ, Math.floor(t / BAR_MS));
  const padF = pick(PAD_HZ, Math.floor(t / BAR_MS) + Math.floor(t / PHRASE_MS));
  const arpF = pick(ARP_HZ, Math.floor(t / (BEAT_MS / 2)));

  const kick = 3 * hit(t, BEAT_MS, 80) * band(freq, 55, 0.7);
  const bassLine =
    2 *
    (0.25 + 0.75 * hit(t, BEAT_MS, 260)) *
    (band(freq, bassF, 0.35) +
      0.6 * band(freq, bassF * 2, 0.3) +
      0.3 * band(freq, bassF * 3, 0.3));
  const snare =
    2.5 *
    hit(t, 2 * BEAT_MS, 100, BEAT_MS) *
    (band(freq, 220, 0.8) + 0.7 * band(freq, 2200, 1.4));
  const hats = 12 * hit(t, BEAT_MS / 2, 45) * band(freq, 11_000, 0.9);
  const pad =
    (0.4 + 0.6 * wave(t, 6000)) *
    (band(freq, padF, 0.2) +
      0.6 * band(freq, padF * 2, 0.2) +
      0.3 * band(freq, padF * 3, 0.25));
  // The arpeggio is what keeps the *peak* moving between bins; without a part
  // that changes pitch faster than the bar, peak-normalisation pins one bar at
  // full height and the rest read as a static backdrop.
  const arp =
    3 *
    hit(t, BEAT_MS / 2, 130) *
    (band(freq, arpF, 0.22) +
      0.5 * band(freq, arpF * 2, 0.22) +
      0.28 * band(freq, arpF * 3, 0.26) +
      0.15 * band(freq, arpF * 4, 0.3));

  const tiltDb = -6.5 * Math.log2(freq / 60);
  const rolloff = 1 / (1 + (35 / freq) ** 4);
  return (
    10 ** (tiltDb / 20) *
    rolloff *
    (1 + kick + bassLine + snare + hats + pad + arp)
  );
}

/** One un-smoothed frame, through the backend's own scaling: A-weight, map to
 *  the 120 dB scale, then normalise so the loudest bin of the frame is 1.0. */
function visualizerFrame(t: number): number[] {
  const scaled = VISUALIZER_BANDS.map((b) =>
    Math.max(
      (Math.log10(VISUALIZER_GAIN * synthSpectrum(b.center, t) * b.weight + 1e-10) +
        6) /
        6,
      0,
    ),
  );
  const max = Math.max(...scaled);
  return max > 0 ? scaled.map((v) => Math.min(v / max, 1)) : scaled;
}

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
    /**
     * Track durations are realistic (a ~647s cycle) and deliberately stay that
     * way. A track change is a *discrete* event — art, title and progress bar
     * all swap at once — so it competes for attribution with the add-rail's
     * preset carousel, which steps every `PRESET_INTERVAL_MS` (5s). Shortening
     * durations so all three covers cycle within one browse would drop that
     * event straight into the range where a viewer can't tell whether the card
     * changed because the preset advanced or because the track did.
     *
     * At ~216s per track the two are ~43x apart, so the stream reads as a
     * stable backdrop. The cover you get is `Date.now() % cycle`, so it varies
     * per session instead: all three are seen, just never in the same sitting.
     *
     * The rule for new streams: continuous ones (cpu, visualizer) stay well
     * faster than the preset step so they read as texture; discrete ones stay
     * well slower so they read as backdrop. Nothing belongs in between.
     */
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
        album_art_b64: track.art,
        position_ms: BigInt(Math.floor(tt)),
        duration_ms: BigInt(track.duration),
      };
    },
  },

  visualizer: {
    // Matches the backend's own frame budget rather than running at rAF: a
    // preview that animates smoother than the real thing misrepresents it.
    cadence: VISUALIZER_FRAME_MS,
    generate: (t) => {
      // `FFTStream` smooths each bin with a fast-attack/slow-decay IIR *after*
      // normalising, which is what gives bars their fall time — including when
      // a bar drops only because some other bin became the frame's new peak.
      // A generator that must stay pure over t can't carry that filter's state,
      // so it is approximated by a decaying max over the frames that would have
      // fed it. Same attack (instant) and the same decay constant.
      const mags = visualizerFrame(t);
      for (let k = 1; k <= VISUALIZER_TAIL; k++) {
        const decayed = VISUALIZER_DECAY ** k;
        const past = visualizerFrame(t - k * VISUALIZER_FRAME_MS);
        for (let i = 0; i < mags.length; i++) {
          mags[i] = Math.max(mags[i], past[i] * decayed);
        }
      }
      return VISUALIZER_BANDS.map((b, i) => ({
        freq_lo: b.freq_lo,
        freq_hi: b.freq_hi,
        magnitude: mags[i],
      }));
    },
  },
};
