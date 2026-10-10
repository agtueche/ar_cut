// Who owns a project, a folder or a library media, and who may see it.
//
// Prepared for the future web version (accounts, teams, subscriptions). Locally
// there is one person, LOCAL_OWNER, and everything is private: nothing here
// changes what the app does today. Records written before this field existed
// read as LOCAL_OWNER / "private" (migration on read), so no file needs a rewrite.
//
//   owner       a person ("user") or a team ("team"), by id
//   visibility  "private"  only the owner
//               "team"     every member of the owner's team(s)  → « Partagé »
//               "link"     anyone holding the share link       → « Partagé » by link

export type OwnerKind = "user" | "team";

export interface Owner {
  kind: OwnerKind;
  id: string;
}

export const VISIBILITIES = ["private", "team", "link"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export interface Ownership {
  owner: Owner;
  visibility: Visibility;
}

/** The only person of a local install. A web account id replaces it later. */
export const LOCAL_OWNER: Readonly<Owner> = Object.freeze({ kind: "user", id: "local" });

export function defaultOwnership(): Ownership {
  return { owner: { ...LOCAL_OWNER }, visibility: "private" };
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === "string" && (VISIBILITIES as readonly string[]).includes(value);
}

export function cleanOwner(value: unknown): Owner {
  if (
    isRecord(value) &&
    (value.kind === "user" || value.kind === "team") &&
    typeof value.id === "string" &&
    ID.test(value.id)
  ) {
    return { kind: value.kind, id: value.id };
  }
  return { ...LOCAL_OWNER };
}

/** Reads owner and visibility off any stored record, defaulting each one on its own. */
export function readOwnership(record: unknown): Ownership {
  const raw = isRecord(record) ? record : {};
  return {
    owner: cleanOwner(raw.owner),
    visibility: isVisibility(raw.visibility) ? raw.visibility : "private",
  };
}

/** The person looking, with the teams they belong to. Locally: LOCAL_OWNER, no team. */
export interface Viewer {
  userId: string;
  teamIds: readonly string[];
}

export const LOCAL_VIEWER: Readonly<Viewer> = Object.freeze({
  userId: LOCAL_OWNER.id,
  teamIds: [],
});

function ownedBy(viewer: Viewer, owner: Owner): boolean {
  return owner.kind === "user" ? owner.id === viewer.userId : viewer.teamIds.includes(owner.id);
}

/**
 * May this viewer see the record? The owner always does; "team" opens it to the
 * owner's team members (a user-owned record shared with a team carries that team
 * as owner); "link" is decided by the share-link check, not here.
 */
export function canView(viewer: Viewer, item: Ownership): boolean {
  if (ownedBy(viewer, item.owner)) return true;
  if (item.visibility === "team")
    return item.owner.kind === "team" && viewer.teamIds.includes(item.owner.id);
  return false;
}

/** May this viewer change or delete the record? Only its owner (or a member of the owning team). */
export function canEdit(viewer: Viewer, item: Ownership): boolean {
  return ownedBy(viewer, item.owner);
}

/** What belongs in « Partagé » for this viewer: visible, shared, and not their own. */
export function isSharedWith(viewer: Viewer, item: Ownership): boolean {
  return (
    item.visibility !== "private" &&
    canView(viewer, item) &&
    !(item.owner.kind === "user" && item.owner.id === viewer.userId)
  );
}
