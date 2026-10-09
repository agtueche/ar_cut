# Hyperframes Creator v2 — audit et feuille de route

Audit du 6 octobre 2026, fait sur le code (packages/studio, studio-server, core, engine, producer).
Légende : ✅ existe et rendu à l'export · 🟡 partiel / à compléter · ❌ absent / à développer.
« Export » signifie que la sortie MP4 reproduit le réglage (capture Chrome pour l'image, ffmpeg + WebAudio hors ligne pour le son).

## 1. Organisation générale

| Fonction | État | Détail |
| --- | --- | --- |
| Panneaux redimensionnables, repliables, disposition par défaut restaurable, sauvegardée par projet | ✅ | dockview (`components/dock`), menu Window → Reset layout |
| Retour aux projets, Exporter | ✅ | ajouts Creator dans l'en-tête |
| Nom du projet modifiable dans l'en-tête | ❌ | |
| État de sauvegarde (Enregistrement… / Enregistré / Erreur) | 🟡 | seulement une bannière en cas de blocage ; `studioPendingEdits` fournit l'état |
| Annuler / rétablir dans l'en-tête | 🟡 | présents dans la barre de la timeline |
| Paramètres du projet (format, cadence, durée) | ❌ | |
| Interface française | 🟡 | écrans Creator + en-tête ; panneaux du Studio en anglais |

## 2. Bibliothèque (panneau gauche)

| Onglet / fonction | État | Détail |
| --- | --- | --- |
| Multimédia : import bouton + glisser-déposer, recherche, filtres type, « utilisé », aperçu, glisser vers la timeline | ✅ | `AssetsTab` |
| Multimédia : tri, dossiers, métadonnées (dimensions, durée, i/s, format), médias manquants + relocalisation, fonds unis/dégradés | 🟡/❌ | |
| Catalogue de blocs (~400) | ✅ | `BlocksTab` |
| Son : bibliothèque gratuite, écoute, favoris, enregistrement micro | ❌ | |
| Texte : titres, bandeaux, typographie cinétique, styles enregistrés | 🟡 | panneau « Ajouter » Creator (7 animations) |
| Stickers et éléments | ❌ | |
| Effets | 🟡 | ~40 effets dans l'inspecteur (étalonnage) ; pas d'onglet bibliothèque |
| Transitions entre clips | 🟡 | badge de transition + blocs du catalogue ; pas d'onglet dédié |
| Légendes : saisie, import SRT/VTT, transcription, styles | 🟡 | édition par mot (position, couleur) ; SRT/VTT et transcription seulement en CLI |
| Filtres, Ajustement, LUT | 🟡 | 20 préréglages + import .cube dans l'inspecteur |
| Calque d'ajustement | 🟡 | moteur prêt (VFX « backdrop ») ; aucune interface |

## 3. Inspecteur vidéo / image

| Fonction | État |
| --- | --- |
| Position, dimensions, échelle, rotation, perspective (images clés) | ✅ |
| Recadrage, ajuster / remplir, opacité, modes de fusion, fond | ✅ |
| Miroir horizontal / vertical | ❌ |
| Suppression d'arrière-plan automatique (modèle local) | ✅ |
| Chroma key (pipette, tolérance, douceur, débordement) | ❌ |
| Masques rectangle / cercle | 🟡 (sans douceur, inversion, linéaire) |
| Préréglages d'animation entrée / sortie / combinée | ❌ (éditeur GSAP libre ✅) |
| Vitesse constante + rampes, hauteur préservée | ✅ |
| Lecture inversée, choix « ne pas préserver la hauteur » | ❌ |
| Étalonnage : exposition, contraste, ombres/hautes lumières, blancs/noirs, température/teinte, saturation, vibrance, roues, courbes RVB, HSL, vignette, grain, LUT + intensité, avant/après, préréglages | ✅ |
| Netteté | ❌ |
| Stabilisation | ❌ |

## 4. Son

| Fonction | État |
| --- | --- |
| Volume en dB, sourdine, fondus, automatisation du volume | ✅ |
| Égaliseur, compresseur, limiteur, gate, réverbération, délai, etc. (préréglages) | ✅ |
| Normalisation LUFS, « égaliser les niveaux » | ✅ |
| Réduction de la musique sous la voix (carve / duck) | ✅ |
| Bus audio (groupes) | ✅ |
| Vumètre | ✅ (aperçu) |
| Panoramique gauche / droite | ❌ |
| Mono / stéréo | 🟡 (toujours stéréo) |
| Réduction de bruit, isolation vocale | ❌ |
| Placement spatial (derrière, haut, bas) | ❌ — nécessite un rendu binaural (HRTF) au casque |

## 5. Texte et légendes

| Fonction | État |
| --- | --- |
| Contenu, police, taille, graisse, couleur, alignement, espacements, casse | ✅ |
| Contour, ombre du texte | ❌ |
| Fond et marges | 🟡 |
| Légendes : modification segment par segment, styles communs, retour à la ligne, mise en évidence | 🟡 (modèle prêt, non sauvegardé) |

## 6. Timeline

| Fonction | État |
| --- | --- |
| Sélection, multi-sélection, rectangle | ✅ |
| Déplacer, ajuster, scinder, outil de coupe, suppression, fermeture des espaces | ✅ |
| Copier / couper / coller / dupliquer, grouper, lier / délier, extraire l'audio, arrêt sur image | ✅ |
| Supprimer à gauche / à droite de la tête de lecture | ❌ |
| Masquer une piste / couper le son d'une piste audio | ✅ |
| Nom de piste modifiable et conservé | ❌ |
| Couleur, verrouillage (interface), solo, hauteur réglable, ajout / suppression / réordonnancement de pistes | ❌ (verrouillage par élément pris en charge par le moteur) |
| Menu contextuel de piste | ❌ |
| Marqueurs nommés, colorés | ❌ (temps forts musicaux seulement) |
| Aimantation : tête de lecture, bords, temps forts | ✅ — désactivation temporaire, marqueurs ❌ |
| Images clés (losanges, préc./suiv., courbes d'accélération, glisser) | ✅ — copier/coller dans le temps 🟡 |
| Zoom, ajuster à la fenêtre | ✅ |

## 7. Prévisualisation

| Fonction | État |
| --- | --- |
| Lecture, image par image, boucle, entrée / sortie (I / O), zoom, plein écran, capture d'image | ✅ |
| Timecode modifiable | 🟡 (champ « aller à l'image » dans le panneau des raccourcis) |
| Qualité de prévisualisation | ❌ |
| Proxies pour vidéos lourdes | ✅ (automatiques) |
| Guides d'alignement, grille, zones de sécurité | à vérifier dans la mise en œuvre |

## 8. Export

| Fonction | État |
| --- | --- |
| MP4 / WebM / MOV, 24/30/60 i/s, qualité, résolutions (paysage, portrait, carré, 4K), progression, annulation, file, historique | ✅ |
| 25 / 50 i/s dans l'interface | ❌ (le moteur l'accepte) |
| Débit personnalisé | ❌ (le moteur l'accepte) |
| Export d'une zone (entrée → sortie) | ❌ |
| Export audio seul | ❌ |
| Export SRT / VTT | ❌ (CLI seulement) |

## 9. Ressources gratuites

Aucune ressource intégrée à ce jour. À ajouter avec un registre des licences et un écran « Crédits et licences ».

## Ordre d'implémentation

1. En-tête (nom modifiable, état de sauvegarde, annuler/rétablir, paramètres du projet), bibliothèque à onglets façon CapCut.
2. Pistes (nom, couleur, verrouillage, solo, hauteur, menu contextuel) et outils (supprimer à gauche/droite, marqueurs).
3. Vidéo et son essentiels (miroir, panoramique, inversion, export 25/50 i/s, zone, audio seul).
4. Textes (contour, ombre, préréglages d'entrée/sortie), légendes sauvegardées, SRT/VTT.
5. Filtres, LUT, calque d'ajustement (interfaces sur le moteur existant).
6. Ressources gratuites + crédits, traitements avancés (chroma key, réduction de bruit, spatial).
7. Performance, sauvegarde, export.
8. Vérification finale sur le projet de validation décrit dans la demande.
