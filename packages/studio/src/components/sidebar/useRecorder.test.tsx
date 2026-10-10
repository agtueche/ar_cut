// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_LIVE, useRecorder } from "./useRecorder";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("recovers from an unanswered permission request and releases a late microphone stream", async () => {
  vi.useFakeTimers();
  let resolveCapture: (stream: MediaStream) => void = () => {};
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        resolveCapture = resolve;
      }),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", class {});
  const host = document.createElement("div");
  const root = createRoot(host);
  const onRecorded = vi.fn();
  function Harness() {
    const rec = useRecorder({
      kind: "voice",
      live: DEFAULT_LIVE,
      micId: "",
      cameraId: "",
      onRecorded,
    });
    return (
      <>
        <button onClick={() => void rec.startMonitor()}>Start</button>
        <span>{rec.phase}</span>
        <p>{rec.error}</p>
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector("span")?.textContent).toBe("starting");
    await act(async () => vi.advanceTimersByTime(15000));
    expect(host.querySelector("span")?.textContent).toBe("error");
    expect(host.querySelector("p")?.textContent).toContain("Autorisez le microphone");
    const stop = vi.fn();
    await act(async () =>
      resolveCapture({ getTracks: () => [{ stop }] } as unknown as MediaStream),
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(onRecorded).not.toHaveBeenCalled();
    await act(async () => host.querySelector("button")!.click());
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(host.querySelector("span")?.textContent).toBe("starting");
  } finally {
    await act(async () => root.unmount());
  }
});
