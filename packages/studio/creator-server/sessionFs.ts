// Node-compatible overloads are preserved at this adapter boundary.
import * as native from "node:fs";
import { dispatch } from "./sessionFsDispatch";
export { constants, Dirent, Stats } from "node:fs";
import * as promises from "./sessionFsPromises";
export { promises };
export const accessSync = ((...args: unknown[]) =>
  dispatch("accessSync", args, false)) as typeof native.accessSync;
export const appendFileSync = ((...args: unknown[]) =>
  dispatch("appendFileSync", args, false)) as typeof native.appendFileSync;
export const chmodSync = ((...args: unknown[]) =>
  dispatch("chmodSync", args, false)) as typeof native.chmodSync;
export const closeSync = ((...args: unknown[]) =>
  dispatch("closeSync", args, false)) as typeof native.closeSync;
export const copyFileSync = ((...args: unknown[]) =>
  dispatch("copyFileSync", args, false)) as typeof native.copyFileSync;
export const cpSync = ((...args: unknown[]) =>
  dispatch("cpSync", args, false)) as typeof native.cpSync;
export const createReadStream = ((...args: unknown[]) =>
  dispatch("createReadStream", args, false)) as typeof native.createReadStream;
export const createWriteStream = ((...args: unknown[]) =>
  dispatch("createWriteStream", args, false)) as typeof native.createWriteStream;
export const existsSync = ((...args: unknown[]) =>
  dispatch("existsSync", args, false)) as typeof native.existsSync;
export const fstatSync = ((...args: unknown[]) =>
  dispatch("fstatSync", args, false)) as typeof native.fstatSync;
export const fsyncSync = ((...args: unknown[]) =>
  dispatch("fsyncSync", args, false)) as typeof native.fsyncSync;
export const ftruncateSync = ((...args: unknown[]) =>
  dispatch("ftruncateSync", args, false)) as typeof native.ftruncateSync;
export const linkSync = ((...args: unknown[]) =>
  dispatch("linkSync", args, false)) as typeof native.linkSync;
export const lstatSync = ((...args: unknown[]) =>
  dispatch("lstatSync", args, false)) as typeof native.lstatSync;
export const mkdirSync = ((...args: unknown[]) =>
  dispatch("mkdirSync", args, false)) as typeof native.mkdirSync;
export const mkdtempSync = ((...args: unknown[]) =>
  dispatch("mkdtempSync", args, false)) as typeof native.mkdtempSync;
export const openSync = ((...args: unknown[]) =>
  dispatch("openSync", args, false)) as typeof native.openSync;
export const readFile = ((...args: unknown[]) =>
  dispatch("readFile", args, false)) as typeof native.readFile;
export const readFileSync = ((...args: unknown[]) =>
  dispatch("readFileSync", args, false)) as typeof native.readFileSync;
export const readSync = ((...args: unknown[]) =>
  dispatch("readSync", args, false)) as typeof native.readSync;
export const readdirSync = ((...args: unknown[]) =>
  dispatch("readdirSync", args, false)) as typeof native.readdirSync;
export const readlinkSync = ((...args: unknown[]) =>
  dispatch("readlinkSync", args, false)) as typeof native.readlinkSync;
export const realpathSync = ((...args: unknown[]) =>
  dispatch("realpathSync", args, false)) as typeof native.realpathSync;
export const renameSync = ((...args: unknown[]) =>
  dispatch("renameSync", args, false)) as typeof native.renameSync;
export const rmSync = ((...args: unknown[]) =>
  dispatch("rmSync", args, false)) as typeof native.rmSync;
export const rmdirSync = ((...args: unknown[]) =>
  dispatch("rmdirSync", args, false)) as typeof native.rmdirSync;
export const statSync = ((...args: unknown[]) =>
  dispatch("statSync", args, false)) as typeof native.statSync;
export const statfsSync = ((...args: unknown[]) =>
  dispatch("statfsSync", args, false)) as typeof native.statfsSync;
export const symlinkSync = ((...args: unknown[]) =>
  dispatch("symlinkSync", args, false)) as typeof native.symlinkSync;
export const unlinkSync = ((...args: unknown[]) =>
  dispatch("unlinkSync", args, false)) as typeof native.unlinkSync;
export const utimesSync = ((...args: unknown[]) =>
  dispatch("utimesSync", args, false)) as typeof native.utimesSync;
export const watch = ((...args: unknown[]) =>
  dispatch("watch", args, false)) as typeof native.watch;
export const writeFileSync = ((...args: unknown[]) =>
  dispatch("writeFileSync", args, false)) as typeof native.writeFileSync;
export const writeSync = ((...args: unknown[]) =>
  dispatch("writeSync", args, false)) as typeof native.writeSync;
realpathSync.native = realpathSync;
export default {
  constants: native.constants,
  Dirent: native.Dirent,
  Stats: native.Stats,
  accessSync,
  appendFileSync,
  chmodSync,
  closeSync,
  copyFileSync,
  cpSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFile,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  statfsSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  watch,
  writeFileSync,
  writeSync,
  promises,
};
