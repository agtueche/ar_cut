import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "../../components/ui";
import { useStudioBridge } from "../studioBridge";
import { Modal } from "./common";
import { setStudioNavigationGuard } from "../studioNavigation";

interface Status {
  dirty: boolean;
  saving: boolean;
  revision: number;
  error: string | null;
}
interface SessionView {
  status: Status;
  save: () => Promise<boolean>;
}
const Session = createContext<SessionView | null>(null);
export const useManualSaveSession = () => useContext(Session);

export function ManualSaveSession({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<Status>({
    dirty: false,
    saving: false,
    revision: 0,
    error: null,
  });
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const latest = useRef(status);
  latest.current = status;
  const inFlight = useRef(false);
  const bridge = useStudioBridge();
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;
  const resolveLeave = useRef<((allow: boolean) => void) | null>(null);
  const leavePromise = useRef<Promise<boolean> | null>(null);
  const url = `/api/studio-session/${encodeURIComponent(projectId)}`;
  const request = useCallback(
    async (action: string, method = "GET"): Promise<Status> => {
      const response = await fetch(`${url}/${action}`, {
        method,
        ...(method !== "GET" && { headers: { "Content-Type": "application/json" }, body: "{}" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Le serveur ne répond pas.");
      return body;
    },
    [url],
  );

  const save = useCallback(async () => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setStatus((current) => ({ ...current, saving: true, error: null }));
    try {
      await bridgeRef.current?.waitForPendingSaves();
      const next = await request("save", "POST");
      setStatus(next);
      latest.current = next;
      return true;
    } catch (error) {
      setStatus((current) => ({
        ...current,
        saving: false,
        error: error instanceof Error ? error.message : "Échec de l’enregistrement.",
      }));
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [request]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (inFlight.current) return;
      try {
        const next = await request("status");
        if (active && !inFlight.current) {
          setStatus((current) => ({ ...next, error: next.error ?? current.error }));
          setReady(true);
        }
      } catch (error) {
        if (active) setStatus((current) => ({ ...current, error: String(error) }));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 700);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [request]);

  useEffect(() => {
    const guard = async () => {
      await bridgeRef.current?.waitForPendingSaves();
      try {
        const next = await request("status");
        latest.current = next;
        setStatus(next);
      } catch {
        /* Ask before abandoning an uncertain state. */ latest.current = {
          ...latest.current,
          dirty: true,
        };
      }
      if (!latest.current.dirty) return true;
      if (leavePromise.current) return leavePromise.current;
      setLeaving(true);
      leavePromise.current = new Promise((resolve) => {
        resolveLeave.current = resolve;
      });
      return leavePromise.current;
    };
    setStudioNavigationGuard(guard);
    const unload = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty || inFlight.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void save();
      }
    };
    const pending = () => {
      latest.current = { ...latest.current, dirty: true };
      setStatus(latest.current);
    };
    window.addEventListener("studio:pending-mutation", pending);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("keydown", keyboard, true);
    return () => {
      setStudioNavigationGuard(null);
      window.removeEventListener("studio:pending-mutation", pending);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("keydown", keyboard, true);
    };
  }, [request, save]);

  const finish = (allow: boolean) => {
    setLeaving(false);
    resolveLeave.current?.(allow);
    resolveLeave.current = null;
    leavePromise.current = null;
  };
  return (
    <Session.Provider value={{ status, save }}>
      {ready ? (
        children
      ) : (
        <div className="p-8 text-text-1" role="status">
          {status.error ?? "Ouverture de la session de montage…"}
        </div>
      )}
      {leaving && (
        <Modal
          title="Modifications non enregistrées"
          onClose={() => finish(false)}
          footer={
            <>
              <Button onClick={() => finish(false)}>Annuler</Button>
              <Button
                disabled={status.saving}
                onClick={() =>
                  void request("discard", "POST")
                    .then(() => finish(true))
                    .catch((error) =>
                      setStatus((current) => ({ ...current, error: String(error) })),
                    )
                }
              >
                Quitter sans enregistrer
              </Button>
              <Button
                disabled={status.saving}
                onClick={() =>
                  void save().then((ok) => {
                    if (ok && !latest.current.dirty) finish(true);
                  })
                }
              >
                Enregistrer et quitter
              </Button>
            </>
          }
        >
          <p>Enregistrer les modifications avant de quitter le Studio ?</p>
          {status.error && (
            <p role="alert" className="mt-2 text-danger-ink">
              {status.error}
            </p>
          )}
        </Modal>
      )}
    </Session.Provider>
  );
}

export function ManualSaveControls() {
  const session = useManualSaveSession();
  if (!session) return null;
  const { status, save } = session;
  const label = status.error
    ? "Échec de l’enregistrement"
    : status.saving
      ? "Enregistrement en cours"
      : status.dirty
        ? "Modifications non enregistrées"
        : "Enregistré";
  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={status.saving}
        title="Enregistrer le montage (⌘S)"
        onClick={() => void save()}
      >
        Enregistrer
      </Button>
      <span
        role="status"
        title={status.error ?? label}
        className={status.error ? "text-danger-ink text-step-11" : "text-text-muted text-step-11"}
      >
        {label}
      </span>
    </div>
  );
}
