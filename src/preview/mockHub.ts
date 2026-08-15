import { StreamName } from "../ffi_types";
import { StreamEvents } from "../ipc/events";
import { previewClock } from "./clock";
import { MOCK_STREAMS } from "./mockStreams";

type Listener<K extends StreamName> = (value: StreamEvents[K]) => void;

interface Driver {
  listeners: Set<Listener<never>>;
  latest: unknown;
  timer: number | null;
  raf: number | null;
}

/**
 * Deliberate miniature of the backend's own stream model: one driver per
 * channel, broadcast to all subscribers, `latest` kept so a late mount
 * renders immediately, and ref-counted so a driver stops ticking when its
 * last subscriber leaves (the frontend twin of SubscriberGate/last_value).
 */
export class MockHub {
  private readonly drivers = new Map<StreamName, Driver>();

  private tick(name: StreamName, driver: Driver) {
    const value = MOCK_STREAMS[name].generate(previewClock.now());
    driver.latest = value;
    for (const listener of driver.listeners) {
      (listener as Listener<StreamName>)(value as StreamEvents[StreamName]);
    }
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
    return MOCK_STREAMS[name].generate(previewClock.now()) as StreamEvents[K];
  }

  subscribe<K extends StreamName>(name: K, listener: Listener<K>): () => void {
    let driver = this.drivers.get(name);
    if (!driver) {
      driver = { listeners: new Set(), latest: undefined, timer: null, raf: null };
      this.drivers.set(name, driver);
    }
    const d = driver;
    d.listeners.add(listener as Listener<never>);
    if (d.listeners.size === 1) this.start(name, d);

    return () => {
      d.listeners.delete(listener as Listener<never>);
      if (d.listeners.size === 0) this.stop(d);
    };
  }

  /** Stop every driver; called when the preview environment unmounts. */
  dispose() {
    for (const driver of this.drivers.values()) {
      this.stop(driver);
      driver.listeners.clear();
    }
    this.drivers.clear();
  }
}
