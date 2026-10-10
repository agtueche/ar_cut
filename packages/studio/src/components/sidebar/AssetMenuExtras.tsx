// Right-click menu of a project media (rush, voice, music…): the entries added for
// Ar cut. Each one does real work on the file; nothing here only pretends to.
import { useEffect, useState } from "react";
import { useStudioLabel } from "../../creator/useStudioLabel";
import { openInSourceMonitor } from "../../creator/sourceMonitorRequest";
import { assetActionsApi, type AssetDetails } from "../../creator/creatorApi";
import { useDockLayoutStore } from "../dock/dockLayoutStore";
import { useStudioShellContextOptional } from "../../contexts/StudioContext";
import { useFileManagerContextOptional } from "../../contexts/FileManagerContext";
import { resolveMediaPreviewUrl } from "../../player/components/thumbnailUtils";
import { AUDIO_EXT, VIDEO_EXT } from "../../utils/mediaTypes";
import { filename } from "./assetHelpers";
import { useMediaFolderActions } from "./mediaFolders";
import { MenuDialog, PromptDialog } from "./MenuDialogs";
import { Button } from "../ui";

export type ExtraMode = "info" | "new-folder" | "extract";
export type AssetDialog = ExtraMode | "rename" | "delete";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** « Ouvrir dans le moniteur source » + file entries (Finder, copie, audio, infos). */
export function AssetExtraItems({
  asset,
  itemCls,
  onMode,
  onClose,
}: {
  asset: string;
  itemCls: string;
  onMode: (mode: ExtraMode) => void;
  onClose: () => void;
}) {
  const label = useStudioLabel();
  const projectId = useStudioShellContextOptional()?.projectId;
  if (!projectId) return null;
  const timed = VIDEO_EXT.test(asset) || AUDIO_EXT.test(asset);
  return (
    <>
      {timed && (
        <button
          role="menuitem"
          className={itemCls}
          onClick={() => {
            openInSourceMonitor(asset);
            useDockLayoutStore.getState().activatePanel("source");
            onClose();
          }}
        >
          {label("Open in source monitor", "Ouvrir dans le moniteur source")}
        </button>
      )}
      <button role="menuitem" className={itemCls} onClick={() => onMode("info")}>
        {label("Media information", "Informations du média")}
      </button>
      <button
        role="menuitem"
        className={itemCls}
        onClick={() => {
          void assetActionsApi.reveal(projectId, asset).catch(() => {});
          onClose();
        }}
      >
        {label("Show in Finder", "Afficher dans le Finder")}
      </button>
      <a
        role="menuitem"
        className={`block ${itemCls}`}
        href={resolveMediaPreviewUrl(asset, projectId)}
        download={filename(asset)}
        onClick={onClose}
      >
        {label("Download a copy", "Télécharger une copie")}
      </a>
      {VIDEO_EXT.test(asset) && (
        <button role="menuitem" className={itemCls} onClick={() => onMode("extract")}>
          {label("Extract audio", "Extraire l'audio")}
        </button>
      )}
    </>
  );
}

/** « Nouveau dossier avec cet élément », placed with the other folder entries. */
export function NewFolderItem({
  itemCls,
  onMode,
}: {
  itemCls: string;
  onMode: (mode: ExtraMode) => void;
}) {
  const label = useStudioLabel();
  if (!useMediaFolderActions()?.create) return null;
  return (
    <button role="menuitem" className={itemCls} onClick={() => onMode("new-folder")}>
      {label("New folder with this item", "Nouveau dossier avec cet élément")}
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} Go`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds * 10) / 10;
  const m = Math.floor(s / 60);
  return m ? `${m} min ${(s % 60).toFixed(1)} s` : `${s.toFixed(1)} s`;
}

function detailRows(d: AssetDetails, label: ReturnType<typeof useStudioLabel>) {
  const rows: Array<[string, string]> = [[label("Size", "Taille"), formatBytes(d.size)]];
  if (d.duration) rows.push([label("Duration", "Durée"), formatDuration(d.duration)]);
  if (d.video) {
    rows.push([label("Resolution", "Résolution"), `${d.video.width} × ${d.video.height}`]);
    if (d.video.fps) rows.push([label("Frame rate", "Cadence"), `${d.video.fps} i/s`]);
    rows.push([label("Video codec", "Codec vidéo"), d.video.codec]);
  }
  if (d.audio) {
    const ch =
      d.audio.channels === 1
        ? "mono"
        : d.audio.channels === 2
          ? "stéréo"
          : `${d.audio.channels} canaux`;
    rows.push([
      label("Audio", "Audio"),
      `${d.audio.codec}, ${ch}, ${Math.round(d.audio.sampleRate / 100) / 10} kHz`,
    ]);
  } else if (d.video) {
    rows.push([label("Audio", "Audio"), label("none", "aucun")]);
  }
  return rows;
}

/** Centred window: what the file really is (FFprobe), read when opened. */
export function AssetInfoDialog({ asset, onClose }: { asset: string; onClose: () => void }) {
  const label = useStudioLabel();
  const projectId = useStudioShellContextOptional()?.projectId ?? "";
  const [details, setDetails] = useState<AssetDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    assetActionsApi
      .details(projectId, asset)
      .then((r) => live && setDetails(r.details))
      .catch((e: unknown) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [projectId, asset]);
  return (
    <MenuDialog
      title={label("Media information", "Informations du média")}
      onClose={onClose}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          {label("Close", "Fermer")}
        </Button>
      }
    >
      <p className="mb-3 break-all text-step-13 font-semibold text-text-0">{filename(asset)}</p>
      {error && <p className="text-step-12 text-danger-ink">{error}</p>}
      {!error && !details && (
        <p className="text-step-12 text-text-muted">{label("Reading…", "Lecture du fichier…")}</p>
      )}
      {details && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-step-12">
          {detailRows(details, label).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-text-muted">{k}</dt>
              <dd className="text-text-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </MenuDialog>
  );
}

/** Centred window: extracts the sound of a video into assets/audio, then lists it. */
export function ExtractAudioDialog({ asset, onClose }: { asset: string; onClose: () => void }) {
  const label = useStudioLabel();
  const projectId = useStudioShellContextOptional()?.projectId ?? "";
  const refresh = useFileManagerContextOptional()?.refreshFileTree;
  const [state, setState] = useState<{ status: "running" | "done" | "error"; text: string }>({
    status: "running",
    text: "",
  });
  useEffect(() => {
    let live = true;
    assetActionsApi
      .extractAudio(projectId, asset)
      .then(async (r) => {
        await refresh?.();
        if (live) setState({ status: "done", text: r.path });
      })
      .catch((e: unknown) => live && setState({ status: "error", text: errorText(e) }));
    return () => {
      live = false;
    };
  }, [projectId, asset, refresh]);
  return (
    <MenuDialog
      title={label("Extract audio", "Extraire l'audio")}
      onClose={onClose}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          {state.status === "running" ? label("Hide", "Masquer") : label("Close", "Fermer")}
        </Button>
      }
    >
      <p className="mb-2 break-all text-step-12 text-text-muted">{filename(asset)}</p>
      {state.status === "running" && (
        <p className="text-step-13 text-text-0">
          {label("Extracting audio…", "Extraction de l'audio en cours…")}
        </p>
      )}
      {state.status === "done" && (
        <>
          <p className="text-step-13 text-text-0">
            {label("Audio extracted to:", "Audio extrait dans :")}
          </p>
          <p className="mt-1 break-all text-step-12 text-accent-ink">{state.text}</p>
        </>
      )}
      {state.status === "error" && <p className="text-step-13 text-danger-ink">{state.text}</p>}
    </MenuDialog>
  );
}

/** Centred window: names a new folder, creates it and puts the media in it. */
export function NewFolderDialog({ asset, onClose }: { asset: string; onClose: () => void }) {
  const label = useStudioLabel();
  const actions = useMediaFolderActions();
  return (
    <PromptDialog
      title={label("New folder with this item", "Nouveau dossier avec cet élément")}
      fieldLabel={label("Folder name", "Nom du dossier")}
      submitLabel={label("Create", "Créer")}
      onClose={onClose}
      onSubmit={async (name) => {
        if (!actions?.create) return;
        const folder = await actions.create(name, null);
        if (!folder) throw new Error(label("Folder not created.", "Dossier non créé."));
        await actions.addItem(folder.id, { projectId: actions.projectId, path: asset });
      }}
    />
  );
}
