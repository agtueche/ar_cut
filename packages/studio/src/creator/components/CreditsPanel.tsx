import { StockCredits } from "./StockCredits";

export function CreditsPanel() {
  return (
    <section
      aria-label="Crédits et licences"
      className="flex h-full flex-col gap-4 overflow-auto p-4 text-sm"
    >
      <h2 className="font-semibold">Crédits et licences</h2>
      <p>
        Les nouveaux fonds, formes et préréglages Creator sont générés par le code du projet. Aucun
        abonnement, crédit ou filigrane n’est ajouté par ces fonctions.
      </p>
      <StockCredits />
      <article>
        <h3 className="font-semibold">memfs — Streamich et contributeurs</h3>
        <p>Système de fichiers en mémoire pour la sauvegarde manuelle. Licence Apache-2.0.</p>
        <a
          className="underline"
          href="/licenses/memfs-Apache-2.0.txt"
          target="_blank"
          rel="noreferrer"
        >
          Lire la licence incluse
        </a>{" "}
        ·{" "}
        <a
          className="underline"
          href="https://github.com/streamich/memfs"
          target="_blank"
          rel="noreferrer"
        >
          Source
        </a>
      </article>
      <article>
        <h3 className="font-semibold">Spatialisation</h3>
        <p>
          Le traitement HRTF utilise Web Audio, intégré au navigateur. Aucun modèle audio ou
          enregistrement tiers n’est redistribué. Utilisation au casque stéréo.
        </p>
      </article>
      <p>
        Les médias personnels restent soumis à leurs propres droits. Aucune bibliothèque musicale
        tierce n’a été ajoutée sans licence vérifiée. Le catalogue préexistant conserve les licences
        de ses auteurs.
      </p>
    </section>
  );
}
