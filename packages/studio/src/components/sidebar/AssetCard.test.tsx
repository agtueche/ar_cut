// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../../player/store/playerStore";
import { useAssetPreviewStore } from "../../utils/assetPreviewStore";
import { AssetCard } from "./AssetCard";
import { AudioRow } from "./AudioRow";
import { readSourceMonitorRequest } from "../../creator/sourceMonitorRequest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  useAssetPreviewStore.getState().clearPreviewAsset();
  vi.restoreAllMocks();
});

function mount(node: React.ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(node);
  });
  return host;
}

function clip(input: Partial<TimelineElement> & { id: string; src: string }): TimelineElement {
  return { tag: "div", start: 0, duration: 5, track: 0, ...input };
}

/** Simulate a drag-free click: pointerdown + pointerup at the same point. */
function clickCard(host: HTMLElement): void {
  const card = host.querySelector('[draggable="true"]');
  if (!card) throw new Error("Expected a draggable card root");
  const PointerCtor = (window as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  act(() => {
    card.dispatchEvent(new PointerCtor("pointerdown", { bubbles: true, clientX: 5, clientY: 5 }));
    card.dispatchEvent(new PointerCtor("pointerup", { bubbles: true, clientX: 5, clientY: 5 }));
  });
}

describe("AssetCard click behavior", () => {
  const cardProps = {
    projectId: "p1",
    onCopy: vi.fn(),
    copyFeedback: null,
  };

  it("opens the clicked video in the source monitor and closes the old preview", () => {
    useAssetPreviewStore.getState().setPreviewAsset("assets/other.png", "p1");
    const host = mount(<AssetCard {...cardProps} asset="assets/plans/V07.mp4" used={false} />);
    clickCard(host);

    expect(useAssetPreviewStore.getState().previewAsset).toBeNull();
    expect(readSourceMonitorRequest()?.path).toBe("assets/plans/V07.mp4");
  });

  it("opens an asset already on the timeline in the monitor too", () => {
    usePlayerStore.getState().setElements([clip({ id: "img1", src: "assets/logo.png" })]);
    const host = mount(<AssetCard {...cardProps} asset="assets/logo.png" used />);
    clickCard(host);

    expect(readSourceMonitorRequest()?.path).toBe("assets/logo.png");
  });
});

describe("AssetCard « + » button", () => {
  it("adds the video to the timeline without opening the preview", () => {
    const onAdd = vi.fn();
    const host = mount(
      <AssetCard
        projectId="p1"
        onCopy={vi.fn()}
        copyFeedback={null}
        asset="assets/plans/V07.mp4"
        used={false}
        duration={10}
        onAddAssetToTimeline={onAdd}
      />,
    );
    const plus = host.querySelector<HTMLButtonElement>('button[title="Add to the timeline"]');
    if (!plus) throw new Error("Expected the « + » button on the thumbnail");
    const PointerCtor = (window as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
    act(() => {
      plus.dispatchEvent(new PointerCtor("pointerdown", { bubbles: true, clientX: 5, clientY: 5 }));
      plus.dispatchEvent(new PointerCtor("pointerup", { bubbles: true, clientX: 5, clientY: 5 }));
      plus.click();
    });
    expect(onAdd).toHaveBeenCalledWith("assets/plans/V07.mp4");
    expect(useAssetPreviewStore.getState().previewAsset).toBeNull();
  });

  it("is absent when the panel cannot add to the timeline", () => {
    const host = mount(
      <AssetCard
        projectId="p1"
        onCopy={vi.fn()}
        copyFeedback={null}
        asset="assets/a.mp4"
        used={false}
        duration={3}
      />,
    );
    expect(host.querySelector('button[title="Add to the timeline"]')).toBeNull();
  });
});

describe("AudioRow click behavior", () => {
  const rowProps = {
    projectId: "p1",
    onCopy: vi.fn(),
    copyFeedback: null,
  };

  it("opens the clicked sound in the source monitor", () => {
    useAssetPreviewStore.getState().setPreviewAsset("assets/other.mp3", "p1");
    const host = mount(<AudioRow {...rowProps} asset="assets/bgm.mp3" used={false} />);
    clickCard(host);

    expect(useAssetPreviewStore.getState().previewAsset).toBeNull();
    expect(readSourceMonitorRequest()?.path).toBe("assets/bgm.mp3");
  });
});
