import { ManualSaveControls } from "../creator/components/ManualSaveSession";
import { memo, useContext, type MouseEvent } from "react";
import { Camera } from "../icons/SystemIcons";
import { useStudioShellContext } from "../contexts/StudioContext";
import { usePanelLayoutContext } from "../contexts/PanelLayoutContext";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { Button, buttonBase, buttonSizes, buttonVariants, cn, Tooltip } from "./ui";
import { Dock } from "./dock/Dock";
import { useDockLayoutStore } from "./dock/dockLayoutStore";
import { InspectorIcon } from "./icons/InspectorIcon";
import { OpenInDesktopButton } from "./OpenInDesktopButton";
import { ArCutLogo } from "./ui/ArCutLogo";
import { ShowThemeToggle, ThemeToggle } from "./ThemeToggle";
import { ArrowLeft, Plus, Robot } from "@phosphor-icons/react";
import { useCreatorEditorControls } from "../creator/CreatorEditorContext";
import {
  HeaderHistoryButtons,
  ProjectSettingsButton,
  ProjectTitleField,
} from "../creator/components/EditorHeaderControls";
import { translate, useI18n, type MessageKey } from "../creator/i18n";

const translateEnglish = (key: MessageKey, vars?: Record<string, string | number>) =>
  translate("en", key, vars);

interface StudioHeaderProps {
  captureFrameHref: string;
  captureFrameFilename: string;
  handleCaptureFrameClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  refreshCaptureFrameTime: () => void;
  capturing?: boolean;
  inspectorButtonActive: boolean;
  inspectorPanelActive: boolean;
  onExport?: () => void;
}

/**
 * Does the header's Inspector button open the panel, or close it?
 *
 * The dock has no separate "railed by window width" state (it shrinks panels,
 * never auto-hides the group), so `rightCollapsed` here is already the state
 * that decides whether the panel is actually showing.
 */
export function shouldOpenInspector(
  rightCollapsed: boolean,
  inspectorPanelActive: boolean,
): boolean {
  return rightCollapsed || !inspectorPanelActive;
}

// fallow-ignore-next-line complexity
export const StudioHeader = memo(function StudioHeader({
  captureFrameHref,
  captureFrameFilename,
  handleCaptureFrameClick,
  refreshCaptureFrameTime,
  capturing,
  inspectorButtonActive,
  inspectorPanelActive,
  onExport,
}: StudioHeaderProps) {
  const showThemeToggle = useContext(ShowThemeToggle);
  const { projectId, renderQueue } = useStudioShellContext();
  const { rightCollapsed, setRightCollapsed, setRightPanelTab } = usePanelLayoutContext();
  const isRendering = renderQueue.isRendering;
  const ffmpegMissing = renderQueue.ffmpegMissing;
  const creator = useCreatorEditorControls();
  const i18n = useI18n();
  // Outside Creator (CLI preview, tests) Studio keeps its English labels.
  const t: typeof i18n.t = creator ? i18n.t : (key, vars) => translateEnglish(key, vars);

  return (
    <div className="flex items-center justify-between h-10 px-3 bg-surface border-b border-border-strong shrink-0">
      {/* Left: logo + project name */}
      <div className="flex items-center gap-3">
        {creator && (
          <Tooltip label={t("editor.backToProjects")} side="bottom">
            <Button
              variant="ghost"
              data-testid="creator-back"
              icon={<ArrowLeft size={14} />}
              onClick={creator.backToProjects}
            >
              {t("editor.backToProjects")}
            </Button>
          </Tooltip>
        )}
        <ArCutLogo />
        <span className="text-text-5 select-none" aria-hidden="true">
          |
        </span>
        {creator ? (
          <>
            <ProjectTitleField fallback={projectId} />
            <ManualSaveControls />
            <span className="text-text-5 select-none" aria-hidden="true">
              |
            </span>
            <HeaderHistoryButtons />
            <ProjectSettingsButton />
          </>
        ) : (
          <span className="text-step-11 font-medium text-text-1">{projectId}</span>
        )}
      </div>
      {/* Right: toolbar buttons */}
      <div className="flex items-center gap-3">
        <div className="flex h-ctl items-center divide-x divide-border-strong overflow-hidden rounded-md border border-border-strong bg-bg-2">
          <Tooltip
            label={capturing ? t("editor.capturing") : t("editor.captureTooltip")}
            side="bottom"
          >
            {/* A real download link, so it wears Button's recipe rather than being
              one: `download` on an <a> is what saves the frame, and no <button>
              can do that. `enabled:` never matches a link, so the ghost
              variant's hover look is repeated unprefixed here. */}
            <a
              href={captureFrameHref}
              download={captureFrameFilename}
              onClick={(e) => {
                if (capturing) {
                  e.preventDefault();
                  return;
                }
                trackStudioEvent("toolbar_action", { action: "capture_frame" });
                handleCaptureFrameClick(e);
              }}
              onFocus={refreshCaptureFrameTime}
              onPointerDown={refreshCaptureFrameTime}
              aria-disabled={capturing || undefined}
              className={cn(
                buttonBase,
                buttonVariants.ghost,
                buttonSizes.md,
                "h-full rounded-none max-[1000px]:px-2",
                capturing
                  ? "text-text-4 cursor-default"
                  : "hover:bg-hover hover:text-text-0 active:scale-[0.98]",
              )}
              aria-label={capturing ? "Capturing frame" : "Capture current frame"}
            >
              {capturing ? (
                <svg
                  className="animate-spin motion-reduce:animate-none h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <Camera size={14} />
              )}
              <span className="max-[1000px]:hidden">
                {capturing ? t("editor.capturing") : t("editor.capture")}
              </span>
            </a>
          </Tooltip>
          <Tooltip label={t("editor.inspector")} side="bottom">
            <Button
              variant="ghost"
              aria-label="Inspector"
              aria-pressed={inspectorButtonActive}
              className={cn(
                "h-full rounded-none",
                inspectorButtonActive &&
                  "bg-on text-accent-ink enabled:hover:bg-on-hover enabled:hover:text-accent-ink",
              )}
              icon={<InspectorIcon size={16} />}
              onClick={() => {
                if (shouldOpenInspector(rightCollapsed, inspectorPanelActive)) {
                  trackStudioEvent("panel_toggle", { panel: "inspector", collapsed: false });
                  setRightPanelTab("design");
                  setRightCollapsed(false);
                  return;
                }
                trackStudioEvent("panel_toggle", { panel: "inspector", collapsed: true });
                // Keep the current selection when collapsing the Inspector — closing
                // the panel shouldn't deselect the element.
                setRightCollapsed(true);
              }}
            >
              {t("editor.inspector")}
            </Button>
          </Tooltip>
        </div>
        {creator && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              data-testid="creator-add"
              aria-label={t("editor.add")}
              icon={<Plus size={14} />}
              onClick={() => useDockLayoutStore.getState().activatePanel("text")}
            >
              <span className="max-[1000px]:hidden">{t("editor.add")}</span>
            </Button>
            <Button
              variant={creator.openPanel === "assistant" ? "secondary" : "ghost"}
              data-testid="creator-assistant"
              aria-label={t("editor.assistant")}
              aria-pressed={creator.openPanel === "assistant"}
              icon={<Robot size={14} />}
              onClick={() => creator.togglePanel("assistant")}
            >
              <span className="max-[1000px]:hidden">{t("editor.assistant")}</span>
            </Button>
          </div>
        )}
        {showThemeToggle && <ThemeToggle />}
        <Dock.WindowMenu />
        <OpenInDesktopButton />
        <Tooltip
          label={
            ffmpegMissing
              ? t("editor.exportNoFfmpeg")
              : isRendering
                ? t("editor.exportBusy")
                : t("editor.exportTooltip")
          }
          side="bottom"
        >
          <Button
            variant="primary"
            className={creator ? "bg-cta text-on-cta enabled:hover:bg-cta-hover" : undefined}
            data-testid="header-export"
            disabled={isRendering}
            onClick={() => {
              if (isRendering) return;
              setRightPanelTab("renders");
              setRightCollapsed(false);
              // Creator confirms format, resolution and project cadence in the panel.
              if (creator) return;
              // Without an encoder this render cannot finish, so the click
              // delivers the user to the prompt that fixes it instead of
              // queueing a job that exists only to fail. Disabling the button
              // would leave them staring at a dead control with no route to
              // the explanation.
              if (ffmpegMissing) return;
              onExport?.();
            }}
          >
            {isRendering ? t("editor.rendering") : t("editor.export")}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
});
