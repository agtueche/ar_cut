# Ar cut

Application locale de montage vidéo, avec bibliothèque de médias, timeline multipiste, inspecteur, sous-titres et export. L’interface personnalisée Ar cut repose sur HyperFrames.

## Démarrage

Prérequis : macOS, Node.js 22+, Bun 1.x, FFmpeg/FFprobe et Google Chrome.

```sh
git clone https://github.com/agtueche/ar_cut.git
cd ar_cut
bun install
bun run build
./lancer-creator.sh
```

Ouvrir l’adresse affichée par le serveur. Pour reprendre le port utilisé pendant le développement :

```sh
bun run --cwd packages/studio dev --port 5190 --strictPort
```

Les montages et médias personnels sont stockés séparément, dans `~/Movies/Hyperframes Creator` par défaut. La variable `HYPERFRAMES_CREATOR_HOME` permet de choisir un autre emplacement. Le changement de marque ne déplace pas les projets existants.

Ce dépôt contient le logiciel et son logo. Les rushs, voix, exports, caches et dépendances locales ne sont pas inclus. Les médias LFS des tests de régression du moteur et des exemples de changelog ne sont pas embarqués ; leur inventaire et la révision amont sont dans `docs/UPSTREAM-TEST-MEDIA.json`. Ils ne sont pas nécessaires au lancement du Studio, mais doivent être récupérés depuis le dépôt amont pour exécuter les tests concernés.

## Documentation

- [Guide du Studio local](LISEZMOI-CREATOR.md)
- [Protocole de montage des rushs](PROTOCOLE-MONTAGE-RUSHS.md)
- [Documentation du moteur HyperFrames](README-UPSTREAM.md)

## Automatisations amont

Les workflows de publication et de maintenance propres au dépôt HyperFrames sont conservés dans `.github/upstream-workflows/`, hors du dossier exécuté par GitHub Actions. Ils ne sont pas activés automatiquement pour Ar cut.

## Origine et licences

Le moteur et les fichiers issus de [HyperFrames](https://github.com/heygen-com/hyperframes) conservent leur licence Apache-2.0 et leurs notices ; voir [LICENSE](LICENSE). La licence MIT créée initialement pour Ar cut est conservée dans [LICENSE-AR-CUT](LICENSE-AR-CUT). Elle ne remplace pas les licences des composants tiers. Les adaptations locales concernent notamment l’interface Creator, les outils de montage, la sauvegarde et l’identité Ar cut.
