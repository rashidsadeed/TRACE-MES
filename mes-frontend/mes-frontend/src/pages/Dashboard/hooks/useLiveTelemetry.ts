import { useState, useEffect, useRef, useCallback } from "react";
import type { TelemetryPoint } from "../types";
import { TELEMETRY_BASE } from "../constants";

const MAX_POINTS = 30; // Keep last 30 seconds visible

/** Adds slight noise to a base value for realistic simulation. */
const jitter = (base: number, range: number): number => {
  const noise = (Math.random() - 0.5) * 2 * range;
  return Math.max(0, +(base + noise).toFixed(2));
};

const formatTime = (d: Date): string =>
  d.toLocaleTimeString("en-GB", { hour12: false });

/**
 * Simulates real-time telemetry at 1 Hz.
 * Returns a sliding window of data points.
 * Pauses when machineId is null (drawer closed).
 */
export const useLiveTelemetry = (machineId: string | null) => {
  const [data, setData] = useState<TelemetryPoint[]>([]);
  const [latest, setLatest] = useState<TelemetryPoint | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    stop();
    setData([]);
    setLatest(null);

    if (!machineId) return;

    const base = TELEMETRY_BASE[machineId];
    if (!base) return;

    // Generate initial 10 points to fill the chart immediately
    const now = Date.now();
    const seed: TelemetryPoint[] = Array.from({ length: 10 }, (_, i) => {
      const t = new Date(now - (10 - i) * 1000);
      return {
        time: formatTime(t),
        spindleRpm: jitter(base.rpm, base.rpm * 0.03),
        spindleLoad: jitter(base.load, 3),
        tempC: jitter(base.temp, 1.5),
        vibration: jitter(base.vibration, base.vibration * 0.3),
        coolantPressure: jitter(base.coolant, 0.3),
      };
    });
    setData(seed);
    setLatest(seed[seed.length - 1]);

    // Tick every 1 second
    intervalRef.current = setInterval(() => {
      const point: TelemetryPoint = {
        time: formatTime(new Date()),
        spindleRpm: jitter(base.rpm, base.rpm * 0.03),
        spindleLoad: jitter(base.load, 3),
        tempC: jitter(base.temp, 1.5),
        vibration: jitter(base.vibration, base.vibration * 0.3),
        coolantPressure: jitter(base.coolant, 0.3),
      };

      setData((prev) => {
        const next = [...prev, point];
        return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
      });
      setLatest(point);
    }, 1000);

    return stop;
  }, [machineId, stop]);

  return { data, latest };
};
