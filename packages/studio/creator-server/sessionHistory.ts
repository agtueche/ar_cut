import { join } from "node:path";
import type { openProjectHistory, ProjectHistory } from "@hyperframes/studio-server";
import type { StudioMemory } from "./sessionMemory";

const key = Symbol.for("hyperframes.creator.memory-history.v1");
const host = globalThis as typeof globalThis & { [key]?: Map<string, Promise<ProjectHistory>> };
const histories = (host[key] ??= new Map<string, Promise<ProjectHistory>>());

export function memoryHistory(session: StudioMemory, open: typeof openProjectHistory) {
  let history = histories.get(session.root);
  if (!history) {
    history = open({
      projectDir: session.root,
      historyRoot: join(session.root, ".studio-memory-history"),
    });
    histories.set(session.root, history);
  }
  return history;
}

export async function closeMemoryHistory(root: string) {
  const history = histories.get(root);
  if (history) await (await history).close();
  histories.delete(root);
}
