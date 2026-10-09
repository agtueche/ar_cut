import * as disk from "node:fs";
import { join, dirname } from "node:path";
import { memoryFor } from "./sessionMemory";
import { exportSnapshot } from "./sessionExport";
import { dispatch } from "./sessionFsDispatch";
import { installRegistryItemWithCli } from "./registryInstall";

/** External CLI runs against a disposable snapshot, never the saved project. */
export async function installSessionRegistryItem(
  opts: Parameters<typeof installRegistryItemWithCli>[0],
) {
  const session = memoryFor(opts.projectDir);
  if (!session) return installRegistryItemWithCli(opts);
  const revision = session.revision;
  const snapshot = exportSnapshot(opts.projectDir);
  try {
    const result = await installRegistryItemWithCli({ ...opts, projectDir: snapshot.dir });
    if (session.revision !== revision)
      throw new Error("Le montage a changé pendant l’installation. Réessayez l’ajout.");
    for (const path of result.written) {
      if (path.split(/[\\/]/).includes("..")) throw new Error("Chemin du catalogue invalide.");
      const target = join(session.root, path);
      session.fs.mkdirSync(dirname(target), { recursive: true });
      dispatch("writeFileSync", [target, disk.readFileSync(join(snapshot.dir, path))]);
    }
    return result;
  } finally {
    snapshot.dispose();
  }
}
