import * as disk from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalPath, memoryFor, registry, type StudioMemory } from "./sessionMemory";

const WRITES =
  /^(write|append|rename|unlink|rm|rmdir|mkdir|copy|cp|link|symlink|chmod|chown|utimes|truncate|ftruncate|fchmod|fchown|futimes|createWrite)/;
const DISK_ONLY = /^(renders|\.thumbnails|\.transcode-cache|\.waveform-cache)(\/|$)/;
let nextFd = -100;

function invoke(target: object, name: string, args: unknown[]): unknown {
  const fn: unknown = Reflect.get(target, name);
  if (typeof fn !== "function")
    throw new Error(`Opération de session non prise en charge : ${name}`);
  return Reflect.apply(fn, target, args);
}

function prepare(session: StudioMemory, name: string, args: unknown[]) {
  const writable =
    WRITES.test(name) ||
    ((name === "openSync" || name === "open") && args[1] !== "r" && args[1] !== 0);
  if (writable) {
    session.revision++;
    for (const value of args.slice(
      0,
      name.startsWith("rename") || name.startsWith("copy") ? 2 : 1,
    )) {
      if (typeof value !== "string") continue;
      const path = resolve(value);
      if (memoryFor(path) !== session) throw new Error("Écriture hors de la session refusée.");
      if (session.media.has(path)) {
        const original = disk.readFileSync(path);
        session.fs.writeFileSync(path, original);
        session.baseline.set(path, original);
        session.media.delete(path);
      }
    }
  }
  return writable;
}

/** Used only by the Vite SSR source transform; CLI and other hosts keep Node's native fs. */
export function dispatch(name: string, args: unknown[], promise = false): unknown {
  args = args.map((value, index) => {
    if (index !== 0 && !(index === 1 && /^(rename|copy|cp|link)/.test(name))) return value;
    if (value instanceof URL) return fileURLToPath(value);
    if (Buffer.isBuffer(value)) return value.toString();
    return value;
  });
  const session = memoryFor(args[0]);
  if (
    !session ||
    (typeof args[0] === "string" && DISK_ONLY.test(relative(session.root, args[0])))
  ) {
    return invoke(promise ? disk.promises : disk, name, args);
  }
  args = args.map((value, index) =>
    typeof value === "string" &&
    (index === 0 || (index === 1 && /^(rename|copy|cp|link)/.test(name)))
      ? canonicalPath(value)
      : value,
  );
  const writable = prepare(session, name, args);
  const path = typeof args[0] === "string" ? resolve(args[0]) : null;
  if (path && session.media.has(path) && !writable)
    return invoke(promise ? disk.promises : disk, name, args);
  if (path && name.startsWith("mkdir")) session.fs.mkdirSync(dirname(path), { recursive: true });
  const mapped = args.map((arg, index) =>
    index === 0 && typeof arg === "number" ? (registry.fds.get(arg)?.inner ?? arg) : arg,
  );
  // Node accepts an explicitly undefined mode; memfs requires its numeric default.
  if ((name === "openSync" || name === "open") && mapped[2] === undefined) mapped[2] = 0o666;
  const options = mapped[2];
  if (
    /^(writeFile|appendFile)/.test(name) &&
    options &&
    typeof options === "object" &&
    "mode" in options &&
    options.mode === undefined
  ) {
    mapped[2] = { ...options, mode: 0o666 };
  }
  const result = invoke(promise ? session.fs.promises : session.fs, name, mapped);
  // Imported binary assets are technical storage, not a saved edit. Publish only NEW assets;
  // never replace existing media. FFmpeg can now probe them without reading the RAM volume.
  const destination = /^(rename|link|copyFile)(Sync)?$/.test(name)
    ? args[1]
    : /^writeFile(Sync)?$/.test(name)
      ? args[0]
      : null;
  const publish = () => {
    if (
      typeof destination === "string" &&
      /\.(mp4|mov|webm|wav|mp3|ogg|m4a|flac|png|jpe?g|webp|gif|woff2?|ttf)$/i.test(destination) &&
      !disk.existsSync(destination)
    ) {
      disk.mkdirSync(dirname(destination), { recursive: true });
      disk.writeFileSync(destination, session.fs.readFileSync(destination), { flag: "wx" });
      session.media.add(destination);
    }
  };
  if (promise)
    return Promise.resolve(result).then((value) => {
      publish();
      return value;
    });
  publish();
  if (name === "openSync" && typeof result === "number") {
    const fd = nextFd--;
    registry.fds.set(fd, { session, inner: result });
    return fd;
  }
  if (name === "closeSync" && typeof args[0] === "number") registry.fds.delete(args[0]);
  return result;
}
