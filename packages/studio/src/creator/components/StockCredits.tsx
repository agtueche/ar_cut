import { useEffect, useState } from "react";
import { stockApi, type StockCredit } from "../creatorApi";
import { useStudioBridge } from "../studioBridge";

/** Credits of the free media imported into the open project (« Banque libre de droits »). */
export function StockCredits() {
  const projectId = useStudioBridge()?.projectId ?? null;
  const [credits, setCredits] = useState<StockCredit[] | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    stockApi
      .projectCredits(projectId)
      .then((r) => !cancelled && setCredits(r.credits))
      .catch(() => !cancelled && setCredits([]));
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  if (!projectId || !credits) return null;
  return (
    <article>
      <h3 className="font-semibold">Médias de la banque libre de droits</h3>
      {credits.length === 0 ? (
        <p className="text-panel-text-5">
          Aucun média de la banque n’a encore été importé dans ce projet.
        </p>
      ) : (
        <>
          <p className="text-panel-text-5">
            À reprendre dans la description ou le générique de la vidéo pour les licences CC BY et
            CC BY-SA.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {credits.map((c) => (
              <li key={c.file} className="text-[12px] leading-snug">
                <span className="font-medium">{c.file}</span>
                {c.attributionRequired ? " — crédit obligatoire" : " — crédit facultatif"}
                <br />
                <span className="select-text">{c.attribution}</span>
                {c.landingUrl && (
                  <>
                    {" "}
                    <a className="underline" href={c.landingUrl} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
