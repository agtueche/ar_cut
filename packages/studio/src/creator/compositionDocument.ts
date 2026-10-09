import { useEffect, useState } from "react";
import { openComposition } from "@hyperframes/sdk";
import { useStudioBridge, type StudioBridge } from "./studioBridge";
import { useManualSaveSession } from "./components/ManualSaveSession";

export function useCompositionDocument() {
  const bridge = useStudioBridge();
  const revision = useManualSaveSession()?.status.revision;
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const path = bridge?.activeCompPath ?? "index.html";
  useEffect(() => {
    let active = true;
    if (!bridge) {
      setHtml("");
      return;
    }
    void bridge
      .readProjectFile(path)
      .then((value) => {
        if (active) {
          setHtml(value);
          setError(null);
        }
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [bridge, path, revision]);
  return { bridge, html, error };
}

export async function editComposition(
  bridge: StudioBridge,
  label: string,
  transform: (html: string) => Promise<string>,
) {
  if (bridge.writeBlockedReason) throw new Error(bridge.writeBlockedReason);
  await bridge.waitForPendingSaves();
  const path = bridge.activeCompPath ?? "index.html";
  const before = await bridge.readProjectFile(path);
  const after = await transform(before);
  if (after === before) return;
  await bridge.writeProjectFile(path, after, before);
  await bridge.recordEdit({ label, files: { [path]: { before, after } } });
  bridge.reloadSdkSession();
  bridge.reloadPreview();
}

export async function setRootAttribute(html: string, name: string, value: string | null) {
  const comp = await openComposition(html, { history: false });
  const root = comp
    .getElements()
    .find((element) => element.attributes["data-composition-id"] !== undefined);
  if (!root) throw new Error("Composition racine introuvable.");
  comp.setAttribute(root.id, name, value);
  return comp.serialize();
}

export function rootAttribute(html: string, name: string): string | null {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelector("[data-composition-id]")?.getAttribute(name) ?? null;
}
