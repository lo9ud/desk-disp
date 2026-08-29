import type { StreamName } from "../../ffi_types";
import type { StreamEvents } from "../events";
import { MOCK_STREAMS } from "../../preview/mockStreams";
import type { Clock } from "../clock";
import type { StreamSource } from "./types";

type AnyHandler = (value: unknown) => void;

interface Driver {
  handlers: Set<AnyHandler>;
  latest: unknown;
  timer: number | null;
  raf: number | null;
}

/**
 * Deliberate miniature of the backend's own stream model: one driver per channel,
 * broadcast to all subscribers, `latest` retained so a late mount renders
 * immediately, and ref-counted so a driver stops ticking when its last subscriber
 * leaves.
 *
 * Satisfies the same `StreamSource` interface as `BackendStreamHub`, which is what
 * lets a preview runtime substitute it wholesale instead of every consumer
 * checking whether it is in a preview.
 */
export class MockStreamHub implements StreamSource {
  private readonly drivers = new Map<StreamName, Driver>();

  constructor(private readonly clock: Clock) {}

  private tick(name: StreamName, driver: Driver) {
    const value = MOCK_STREAMS[name].generate(this.clock.now());
    driver.latest = value;
    driver.handlers.forEach((h) => h(value));
  }

  private start(name: StreamName, driver: Driver) {
    const { cadence } = MOCK_STREAMS[name];
    if (cadence === "raf") {
      const frame = () => {
        this.tick(name, driver);
        driver.raf = requestAnimationFrame(frame);
      };
      driver.raf = requestAnimationFrame(frame);
    } else {
      driver.timer = window.setInterval(() => this.tick(name, driver), cadence);
    }
  }

  private stop(driver: Driver) {
    if (driver.timer !== null) window.clearInterval(driver.timer);
    if (driver.raf !== null) cancelAnimationFrame(driver.raf);
    driver.timer = null;
    driver.raf = null;
  }

  latest<K extends StreamName>(name: K): StreamEvents[K] {
    const driver = this.drivers.get(name);
    if (driver?.latest !== undefined) return driver.latest as StreamEvents[K];
    // Generators are pure over time, so an unstarted stream can still answer.
    return MOCK_STREAMS[name].generate(this.clock.now()) as StreamEvents[K];
  }

  subscribe<K extends StreamName>(
    name: K,
    handler: (value: StreamEvents[K]) => void,
  ): () => void {
    let driver = this.drivers.get(name);
    if (!driver) {
      driver = { handlers: new Set(), latest: undefined, timer: null, raf: null };
      this.drivers.set(name, driver);
    }
    const d = driver;
    const fn = handler as AnyHandler;
    d.handlers.add(fn);
    if (d.handlers.size === 1) this.start(name, d);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      d.handlers.delete(fn);
      if (d.handlers.size === 0) this.stop(d);
    };
  }

  dispose() {
    for (const driver of this.drivers.values()) {
      this.stop(driver);
      driver.handlers.clear();
    }
    this.drivers.clear();
  }
}
