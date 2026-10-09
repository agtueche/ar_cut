# Studio — suivi d’implémentation

Mise à jour du 7 octobre 2026. Périmètre : Studio Creator, préservation des outils existants et sauvegarde explicite du montage et des dispositions. Les captures fournies sont des références ergonomiques ; elles ne prouvent pas une parité fonctionnelle avec les logiciels illustrés.

## Structure intégrée

| Référence | Organisation reprise | Implémentation |
| --- | --- | --- |
| DaVinci Resolve | Source et programme séparés, inspecteur, timeline multipiste | Moniteur Source optionnel avec lecteur indépendant et insertion ; aperçu et timeline existants conservés |
| CapCut | Catégories visuelles, réglages contextuels | Bibliothèque Multimédia, Son, Texte, Éléments, Effets, Transitions, Légendes, Modèles, Ajustement ; navigation dans les sections existantes de l’inspecteur |
| Filmora | Bibliothèque à gauche, informations projet au repos | Informations de résolution, cadence et durée sans sélection ; outils projet accessibles en pied de bibliothèque |

Les panneaux individuels préexistants restent accessibles par Espace de travail. Les catégories visitées restent montées pendant les changements d’onglet. Les nouveaux panneaux et styles sont limités au contexte Creator ; la disposition du Studio historique conserve ses panneaux par défaut.

## Fonctionnalités implémentées

- Dispositions nommées : enregistrer, charger, renommer, supprimer, réinitialiser, revenir à la précédente et verrouiller.
- Session serveur en mémoire, sauvegarde manuelle, détection de conflits externes, abandon, protection de navigation ; export construit à partir d’un instantané des modifications non enregistrées.
- Marqueurs éditables en temps, nom et couleur, affichage sur la règle et aimantation des clips aux marqueurs.
- Import/export SRT et VTT, correction manuelle des textes et temps, scission/fusion, style et application des légendes à la composition.
- Bibliothèque audio locale, préécoute, import et enregistrement micro sur action explicite.
- Génération d’un WAV stéréo par OfflineAudioContext et HRTF à partir de positions source/auditeur, avec préécoute et insertion. Limites affichées : 180 secondes et 64 Mo par source.
- Raccourcis Effets/Ajustement réservés aux images et vidéos, sections contextuelles de l’inspecteur ; aucun contrôle préexistant supprimé.
- Licence Apache-2.0 de memfs incluse dans les crédits ; aucune musique tierce ajoutée sans licence vérifiée.

## Vérifications effectuées

- TypeScript : `bun run typecheck`, réussi.
- Dock, panneaux latéraux et état vide de l’inspecteur : 8 fichiers, 84 tests réussis.
- Creator et mémoire serveur : 7 fichiers, 36 tests réussis. Couverture notamment des conflits de sauvegarde, de l’abandon, de l’instantané non enregistré et des métadonnées de mouvement.
- En-tête et panneau de rendu : 3 fichiers, 23 tests réussis après correction du parcours Exporter.
- Oxlint sur les derniers fichiers modifiés : aucune erreur ni avertissement ; formatage oxfmt appliqué.
- Navigateur réel sur le projet isolé `validation-complete`, port 5290 : catégories, sélection de clip, section Transformation, ouverture et fermeture du moniteur Source vérifiées. Capture : `/tmp/studio-interface-validation.jpg`.
- Premier export réel réussi : MP4 H.264, 1920 × 1080, 15 secondes, contrôlé avec ffprobe. Le bouton supérieur lançait 30 images/s sans consulter les réglages affichés : dans Creator, il ouvre désormais le panneau pour choisir les paramètres avant de lancer le rendu. L’empreinte SHA-256 de la composition sur disque est restée identique pendant l’export.
- Deuxième export depuis le panneau : MP4 H.264, 1920 × 1080, 24 images/s, exactement 15 secondes (990 880 octets), confirmé avec ffprobe. Fichier : `/tmp/hf-studio-validation/projects/validation-complete/renders/validation-complete_2026-10-07_23-44-54.mp4`.
- Les exécutions Vitest terminent leurs tests avec succès mais signalent un handle Vite encore ouvert après dix secondes. Ce diagnostic reste à traiter.

## Validation et travaux encore nécessaires

- Vérifier visuellement un export portant une modification non enregistrée identifiable ; l’instantané et la production d’un vrai MP4 sont validés séparément.
- Vérifier le rendu binaural dans le navigateur et l’export audio final, au-delà des tests d’encodage WAV et de validation des paramètres.
- Exercices complets d’import, découpe, annulation, sauvegarde/rechargement, abandon et dispositions sur plusieurs formats et tailles d’écran.
- Contrôler les écritures serveur non couvertes par l’adaptateur mémoire (notamment chemins URL/Buffer et imports binaires asynchrones).
- Traduction française complète des contrôles historiques encore en anglais.
- Pas de transcription automatique ni de génération automatique de paroles : ces fonctions sont explicitement annoncées indisponibles.
- Le catalogue conserve ses capacités existantes ; afficher un effet ou une transition ne constitue pas à lui seul une validation de son application.
- Le déplacement des marqueurs se fait par leur champ de temps ; le glisser-déposer des marqueurs n’est pas implémenté.
- Pas de déclaration de parité avec les moteurs, mixeurs et outils IA complets de DaVinci Resolve, CapCut ou Filmora.

Aucun montage utilisateur ne doit servir de fixture de test. Ne pas marquer une fonction validée uniquement parce qu’un bouton est visible.
