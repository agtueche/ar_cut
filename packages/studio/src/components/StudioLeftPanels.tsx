import { InspectorLibraryShortcut } from "../creator/components/InspectorLibraryShortcut";
import { SourceMonitor } from "../creator/components/SourceMonitor";
import { CreatorLibrary } from "../creator/components/CreatorLibrary";
import { MarkerSync, MarkersPanel } from "../creator/components/MarkersPanel";
import { SubtitlesPanel } from "../creator/components/SubtitlesPanel";
import { SoundPanel } from "../creator/components/SoundPanel";
import { CreditsPanel } from "../creator/components/CreditsPanel";
import { memo, useCallback, type ReactNode } from "react";
import { SourceEditor } from "./editor/SourceEditor";
import { FileTree } from "./editor/FileTree";
import { MediaPreview } from "./MediaPreview";
import { AssetsTab } from "./sidebar/AssetsTab";
import { BlocksTab, type BlockPreviewInfo } from "./sidebar/BlocksTab";
import { CompositionsPanel } from "./sidebar/CompositionsPanel";
import { SidebarLintButton } from "./sidebar/SidebarLintButton";
import { Dock } from "./dock/Dock";
import { useDockLayoutStore } from "./dock/dockLayoutStore";
import { isMediaFile } from "../utils/mediaTypes";
import { useStudioShellContext } from "../contexts/StudioContext";
import { useFileManagerContext } from "../contexts/FileManagerContext";
import { useCreatorEditorControls } from "../creator/CreatorEditorContext";
import { BackgroundsSection } from "../creator/components/BackgroundsSection";
import { ElementsPanel } from "../creator/components/ElementsPanel";
import { getPersistedRenderSettings } from "./renders/renderSettings";

interface StudioLeftPanelsProps {
  onSelectComposition: (comp: string) => void;
  onAddBlock: (blockName: string) => void;
  onPreviewBlock?: (preview: BlockPreviewInfo | null) => void;
  onLint: () => void;
  linting: boolean;
  lintFindingCount?: number;
  lintHasError?: boolean;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
  onAddAssetToTimeline?: (path: string) => void;
  onAddCompositionToTimeline?: (path: string) => void;
}

function PanelColumn({ footer, children }: { footer: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer}
    </div>
  );
}

// fallow-ignore-next-line complexity
export const StudioLeftPanels = memo(function StudioLeftPanels({
  onSelectComposition,
  onAddBlock,
  onPreviewBlock,
  onLint,
  linting,
  lintFindingCount,
  lintHasError,
  lintFindingsByFile,
  onAddAssetToTimeline,
  onAddCompositionToTimeline,
}: StudioLeftPanelsProps) {
  const { projectId, renderQueue, waitForPendingDomEditSaves } = useStudioShellContext();
  const creator = useCreatorEditorControls();
  const {
    compositions,
    assets,
    editingFile,
    fileTree,
    revealSourceOffset,
    handleFileSelect,
    handleCreateFile,
    handleCreateFolder,
    handleDeleteFile,
    handleRenameFile,
    handleDuplicateFile,
    handleMoveFile,
    handleImportFiles,
    handleContentChange,
  } = useFileManagerContext();

  const handleRenderComposition = useCallback(
    async (comp: string) => {
      // startRender refuses without an encoder and reports why as a row in the
      // Renders panel, which may be closed or behind another tab: bring it up.
      if (renderQueue.ffmpegMissing) {
        useDockLayoutStore.getState().activatePanel("renders");
        return;
      }
      await waitForPendingDomEditSaves();
      const { format, quality, fps } = getPersistedRenderSettings();
      await renderQueue.startRender({ composition: comp, format, quality, fps });
    },
    [renderQueue, waitForPendingDomEditSaves],
  );

  const importFiles = async (files: FileList, dir?: string) => {
    await handleImportFiles(files, dir);
  };
  const lintButton = (
    <SidebarLintButton
      onLint={onLint}
      linting={linting}
      findingCount={lintFindingCount}
      hasError={lintHasError}
    />
  );

  return (
    <>
      {creator && (
        <>
          <MarkerSync />
          <Dock.Panel id="source">
            <SourceMonitor onAdd={onAddAssetToTimeline} />
          </Dock.Panel>
          <Dock.Panel id="library">
            <CreatorLibrary
              content={{
                adjustment: <InspectorLibraryShortcut kind="grade" />,
                media: (
                  <AssetsTab
                    projectId={projectId}
                    assets={assets}
                    onImport={importFiles}
                    onDelete={handleDeleteFile}
                    onRename={handleRenameFile}
                    onAddAssetToTimeline={onAddAssetToTimeline}
                  />
                ),
                sound: <SoundPanel onAdd={onAddAssetToTimeline} />,
                text: <ElementsPanel />,
                elements: (
                  <>
                    <BackgroundsSection />
                    <ElementsPanel />
                  </>
                ),
                effects: (
                  <>
                    <InspectorLibraryShortcut kind="effects" />
                    <BlocksTab
                      initialCategory="effects"
                      onAddBlock={onAddBlock}
                      onPreviewBlock={onPreviewBlock}
                    />
                  </>
                ),
                transitions: (
                  <BlocksTab
                    initialCategory="transitions"
                    onAddBlock={onAddBlock}
                    onPreviewBlock={onPreviewBlock}
                  />
                ),
                subtitles: <SubtitlesPanel />,
                catalog: <BlocksTab onAddBlock={onAddBlock} onPreviewBlock={onPreviewBlock} />,
              }}
            />
          </Dock.Panel>
          <Dock.Panel id="markers">
            <MarkersPanel />
          </Dock.Panel>
          <Dock.Panel id="subtitles">
            <SubtitlesPanel />
          </Dock.Panel>
          <Dock.Panel id="sound">
            <SoundPanel onAdd={onAddAssetToTimeline} />
          </Dock.Panel>
          <Dock.Panel id="credits">
            <CreditsPanel />
          </Dock.Panel>
        </>
      )}
      <Dock.Panel id="compositions">
        <PanelColumn footer={lintButton}>
          <CompositionsPanel
            projectId={projectId}
            compositions={compositions}
            activeComposition={editingFile?.path ?? null}
            onSelect={onSelectComposition}
            onAddToTimeline={onAddCompositionToTimeline}
            onRenderComposition={handleRenderComposition}
            isRendering={renderQueue.isRendering}
            lintFindingsByFile={lintFindingsByFile}
          />
        </PanelColumn>
      </Dock.Panel>
      <Dock.Panel id="assets">
        <PanelColumn footer={lintButton}>
          {creator && <BackgroundsSection />}
          <AssetsTab
            projectId={projectId}
            assets={assets}
            onImport={importFiles}
            onDelete={handleDeleteFile}
            onRename={handleRenameFile}
            onAddAssetToTimeline={onAddAssetToTimeline}
          />
        </PanelColumn>
      </Dock.Panel>
      <Dock.Panel id="text">
        <PanelColumn footer={null}>
          <ElementsPanel />
        </PanelColumn>
      </Dock.Panel>
      <Dock.Panel id="code">
        <PanelColumn footer={lintButton}>
          <div className="flex min-h-0 flex-1">
            {fileTree.length > 0 && (
              <div className="w-[160px] shrink-0 border-r border-neutral-800 overflow-y-auto">
                <FileTree
                  files={fileTree}
                  activeFile={editingFile?.path ?? null}
                  onSelectFile={handleFileSelect}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onDeleteFile={handleDeleteFile}
                  onRenameFile={handleRenameFile}
                  onDuplicateFile={handleDuplicateFile}
                  onMoveFile={handleMoveFile}
                  onImportFiles={importFiles}
                  lintFindingsByFile={lintFindingsByFile}
                />
              </div>
            )}
            <div className="flex-1 overflow-hidden min-w-0">
              <CodeBody
                projectId={projectId}
                editingFile={editingFile}
                revealOffset={revealSourceOffset}
                onChange={handleContentChange}
              />
            </div>
          </div>
        </PanelColumn>
      </Dock.Panel>
      <Dock.Panel id="catalog">
        <PanelColumn footer={lintButton}>
          <BlocksTab onAddBlock={onAddBlock} onPreviewBlock={onPreviewBlock} />
        </PanelColumn>
      </Dock.Panel>
    </>
  );
});

function CodeBody({
  projectId,
  editingFile,
  revealOffset,
  onChange,
}: {
  projectId: string;
  editingFile: { path: string; content: string | null } | null;
  revealOffset: React.ComponentProps<typeof SourceEditor>["revealOffset"];
  onChange: (content: string) => void;
}) {
  if (!editingFile) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-sm">
        Select a file to edit
      </div>
    );
  }
  if (isMediaFile(editingFile.path)) {
    return <MediaPreview projectId={projectId} filePath={editingFile.path} />;
  }
  // Never mount the editor on unloaded content: a keystroke would autosave an
  // empty document over the real file.
  if (editingFile.content == null) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-neutral-600">
        Loading {editingFile.path}…
      </div>
    );
  }
  return (
    <SourceEditor
      content={editingFile.content}
      filePath={editingFile.path}
      onChange={onChange}
      revealOffset={revealOffset}
    />
  );
}
