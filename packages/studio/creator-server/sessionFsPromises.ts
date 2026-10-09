// Node-compatible overloads are preserved at this adapter boundary.
import * as native from "node:fs/promises";
import { dispatch } from "./sessionFsDispatch";
export const copyFile = ((...args: unknown[]) =>
  dispatch("copyFile", args, true)) as typeof native.copyFile;
export const lstat = ((...args: unknown[]) => dispatch("lstat", args, true)) as typeof native.lstat;
export const mkdir = ((...args: unknown[]) => dispatch("mkdir", args, true)) as typeof native.mkdir;
export const mkdtemp = ((...args: unknown[]) =>
  dispatch("mkdtemp", args, true)) as typeof native.mkdtemp;
export const open = ((...args: unknown[]) => dispatch("open", args, true)) as typeof native.open;
export const readFile = ((...args: unknown[]) =>
  dispatch("readFile", args, true)) as typeof native.readFile;
export const readdir = ((...args: unknown[]) =>
  dispatch("readdir", args, true)) as typeof native.readdir;
export const realpath = ((...args: unknown[]) =>
  dispatch("realpath", args, true)) as typeof native.realpath;
export const rename = ((...args: unknown[]) =>
  dispatch("rename", args, true)) as typeof native.rename;
export const rm = ((...args: unknown[]) => dispatch("rm", args, true)) as typeof native.rm;
export const rmdir = ((...args: unknown[]) => dispatch("rmdir", args, true)) as typeof native.rmdir;
export const stat = ((...args: unknown[]) => dispatch("stat", args, true)) as typeof native.stat;
export const unlink = ((...args: unknown[]) =>
  dispatch("unlink", args, true)) as typeof native.unlink;
export const writeFile = ((...args: unknown[]) =>
  dispatch("writeFile", args, true)) as typeof native.writeFile;
export default {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile,
};
