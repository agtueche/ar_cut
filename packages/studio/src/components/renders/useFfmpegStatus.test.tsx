// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { studioApiFetch } from "../../utils/studioApiFetch";
import { useFfmpegStatus } from "./useFfmpegStatus";

vi.mock("../../utils/studioApiFetch", () => ({ studioApiFetch: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Status() {
  const { status } = useFfmpegStatus();
  return <span>{status?.ok ? "available" : "unavailable"}</span>;
}

it("rechecks a failed detection when the panel reopens, then reuses success", async () => {
  const fetch = vi.mocked(studioApiFetch);
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false })));
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
  const host = document.createElement("div");
  document.body.append(host);
  let root = createRoot(host);
  try {
    await act(async () => root.render(<Status />));
    expect(host.textContent).toBe("unavailable");
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<Status />));
    expect(host.textContent).toBe("available");
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<Status />));
    expect(host.textContent).toBe("available");
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
