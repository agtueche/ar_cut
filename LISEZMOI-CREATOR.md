# Ar cut

Interface locale, en français, pour créer et monter des vidéos avec [HyperFrames](https://github.com/heygen-com/hyperframes) depuis le navigateur. Elle prolonge le **Studio** officiel du dépôt (éditeur, timeline, inspecteur, rendu) et lui ajoute un tableau de bord de projets, un assistant de création, des modèles, un panneau d'insertion d'éléments animés et un assistant IA « Préparer pour Claude Code ».

Tout fonctionne en local sur macOS : aucun compte, aucun paiement, aucun service cloud.

---

## Prérequis

| Outil | Version | Rôle |
| --- | --- | --- |
| Node.js | 22 ou plus | exécution du serveur et des outils |
| Bun | 1.x | gestionnaire de paquets du dépôt |
| FFmpeg + FFprobe | récents | encodage MP4, métadonnées des médias |
| Google Chrome (ou `npx hyperframes browser ensure`) | — | capture des images au rendu, miniatures |

Optionnel : `whisper-cli` pour la transcription en ligne de commande (`npx hyperframes transcribe`).

Le tableau de bord vérifie ces dépendances au démarrage (pastille « Prêt pour l'export MP4 » en haut à droite) et donne la commande d'installation de ce qui manque.

## Installation sur macOS

Sur ce Mac, Node, FFmpeg et Bun sont déjà installés dans `~/.local` et `~/.bun`. Sur une autre machine :

```bash
# 1. Outils (avec Homebrew)
brew install node ffmpeg
npm install -g bun

# 2. Code
git clone https://github.com/agtueche/ar_cut.git
cd ar_cut

# 3. Dépendances et compilation (une seule fois, ~10 min)
bun install
bun run build
```

## Lancement

```bash
./lancer-creator.sh
```

Puis ouvrir **http://127.0.0.1:5190** dans le navigateur.

- Les projets sont enregistrés dans `~/Movies/Hyperframes Creator/projects/` (un dossier par projet, avec ses médias et ses exports dans `renders/`).
- La corbeille est dans `~/Movies/Hyperframes Creator/corbeille/`.
- Pour utiliser un autre dossier : `HYPERFRAMES_CREATOR_HOME="/chemin/vers/dossier" ./lancer-creator.sh`.

## Ce que vous pouvez faire

### Tableau de bord
- Projets en grille ou en liste, recherche, tri (modification, nom, création), projets récents.
- Miniature réelle (rendue par le moteur), format, cadence, durée et date de modification.
- Créer, ouvrir, dupliquer, renommer, mettre à la corbeille (avec confirmation), restaurer, supprimer définitivement depuis la corbeille.
- Onglets **Modèles**, **Exports** (lecture, téléchargement) et **Corbeille**.
- Interface en français, bascule en anglais (bouton FR/EN).

### Assistant de création
Nom, format 16:9 / 9:16 / 1:1 ou dimensions personnalisées (nombres pairs de 64 à 7680 px, validés), cadence (24, 25, 30, 50, 60 i/s), durée initiale, composition vide ou l'un des cinq modèles.

### Éditeur (Studio HyperFrames)
- Aperçu interactif : lecture, déplacement dans le temps, timecode, zoom, plein écran, guides.
- Timeline multipiste : déplacement, redimensionnement, découpe, aimantation, formes d'onde, volume, annuler / rétablir (Cmd+Z / Cmd+Maj+Z), historique enregistré sur disque.
- Inspecteur de propriétés, calques, éditeur de code (HTML/CSS/JS) avec la même source de vérité, détection des modifications faites par un autre éditeur.
- Import de médias par glisser-déposer (images, vidéos, audio, SVG).
- **Catalogue** (onglet Catalog, ~400 blocs et effets) : installation directe dans le projet. Le serveur lance la commande officielle `hyperframes add` (internet requis), puis adapte le bloc au format du projet.
- **Export MP4 réel** (bouton orange « Exporter ») : progression, annulation, file de rendu, historique, résolution et cadence au choix.

### Panneau « Ajouter » (nouveau)
Insère à la tête de lecture, sur une nouvelle piste et au-dessus des autres calques : titre, paragraphe, légende, rectangle, cercle, image ou logo du projet. Animations d'entrée réutilisables : fondu, glissement, apparition avec échelle, révélation, machine à écrire, mise en évidence, mouvement doux, avec durée, décalage et accélération. L'insertion passe par le SDK HyperFrames (`addElement` + `addGsapTween`) : l'animation est un tween de la timeline GSAP de la composition, donc déterministe et visible au rendu. Chaque insertion est annulable.

### Assistant IA (nouveau)
Aucun fournisseur d'IA n'est appelé par l'application. Le panneau :
1. prend votre demande en langage naturel, avec le contexte réel (composition active, tête de lecture, élément sélectionné, fichiers du projet) ;
2. génère un **prompt prêt à copier pour Claude Code**, avec les règles HyperFrames et l'interdiction d'utiliser un service d'IA externe sans votre accord ;
3. détecte les modifications faites ensuite par Claude Code (ou tout autre outil) et vous laisse **les garder ou les annuler**, ou revenir à un point de restauration ;
4. garde l'historique de vos demandes par projet.

### Modèles fournis
Publicité produit · Vidéo pédagogique · Motion design typographique · Présentation de services · Vidéo verticale avec sous-titres (mot à mot). Tous sont modifiables et exportables, sans clé API ; ils passent `hyperframes lint` et `hyperframes check`.

## Architecture

| Élément | Emplacement |
| --- | --- |
| API Creator (`/api/creator/*`) : projets, corbeille, modèles, exports, environnement, assistant | `packages/studio/creator-server/` + `packages/studio/vite.creator.ts` |
| Écrans Creator (tableau de bord, assistant de création, panneaux, i18n) | `packages/studio/src/creator/` |
| Modèles | `packages/studio/creator-templates/` |
| Palette (jetons du thème) | `packages/studio/src/styles/theme.css` |
| Lanceur | `lancer-creator.sh` |

Fichiers du Studio modifiés : `src/main.tsx` (racine Creator), `src/App.tsx` (pont vers le panneau « Ajouter »), `src/components/StudioHeader.tsx` (boutons Projets / Ajouter / Assistant IA, libellés traduits, export en orange), `src/styles/theme.css` (palette), `src/utils/studioTheme.ts` et `index.html` (thème sombre par défaut), `vite.config.ts` et `vite.adapter.ts` (dossier des projets configurable, exports dans chaque projet).

Les compositions HTML restent la source de vérité ; `creator.json` (dans chaque projet) ne contient que le titre, la cadence, le modèle d'origine et l'historique des demandes à l'assistant, écrit de façon atomique. Les routes refusent tout identifiant qui n'est pas un segment simple (pas de traversée de chemin) ; aucun contenu utilisateur n'est interpolé dans une commande shell.

## Vérifications effectuées

- **Parcours complet dans le navigateur** : création d'un projet vide → import d'une image et d'une voix (glisser-déposer) → titre animé inséré par « Ajouter » → position modifiée (clavier) et durée allongée (poignée de la timeline) → annuler / rétablir → retour au tableau de bord puis réouverture (tout est conservé) → export MP4 → fichier vérifié : H.264 1920×1080 30 i/s + AAC, titre et légende visibles à 3,5 s, voix audible (−19 dB moyen).
- Projet créé depuis le modèle vertical et rendu à **25 i/s** : 1080×1920, 300 images pour 12 s.
- Assistant IA : prompt généré avec le contexte réel ; une modification externe a été détectée puis annulée depuis le panneau.
- Tableau de bord : duplication, renommage, corbeille, restauration ; affichage mobile sans défilement horizontal.
- Tests : 26 tests ciblés Creator (persistance, création/duplication/corbeille, sécurité des chemins, prompt assistant, insertion d'éléments via le SDK, préréglages d'animation) ; suite complète du Studio ; `tsc` ; `oxlint` / `oxfmt` sur les fichiers modifiés ; `hyperframes lint` et `hyperframes check` sur les cinq modèles.

## Limites connues

- **Mode développement** : l'application tourne sur le serveur de développement Vite du Studio (le Studio n'existe pas en application autonome dans le dépôt). Le premier chargement prend quelques secondes.
- **Traduction partielle** : les écrans Creator et l'en-tête de l'éditeur sont en français ; les panneaux internes du Studio (timeline, inspecteur, rendus, code) restent en anglais.
- **Éditeur pensé pour l'ordinateur** : sur petit écran, seul le tableau de bord est confortable.
- **Résolutions d'export** : celles du Studio (taille de la composition, 1080p et 4K en paysage, portrait ou carré). Pas de préréglage 720p, sauf si la composition elle-même fait 1280×720.
- **Cadence d'export** : le panneau de rendu propose 30 i/s par défaut ; choisissez 25 i/s à la main pour un projet en 25 i/s.
- **WebM / MOV** : proposés par le Studio d'origine mais non vérifiés de bout en bout ici. Seul le MP4 est validé.
- **Sous-titres SRT/VTT** : l'import d'un fichier SRT ou VTT n'est pas converti automatiquement en sous-titres. Les sous-titres éditables passent par une composition de sous-titres du Studio (voir le modèle vertical) ou par `npx hyperframes transcribe`.
- **Transcription et voix IA** : disponibles en ligne de commande (`npx hyperframes transcribe`, `npx hyperframes tts`), pas encore dans l'interface.
- **Assistant IA** : il ne génère rien lui-même. Les fichiers importés par glisser-déposer apparaissent aussi comme « modification externe » dans sa liste (la route d'import du Studio ne les attribue à personne).
- **Modèles** : comme les exemples officiels, ils chargent GSAP depuis un CDN ; une connexion internet est nécessaire pour l'aperçu.
- **Miniatures** : elles sont rendues par Chrome sans interface ; avec 8 Go de mémoire, la première ouverture du tableau de bord peut être lente.
