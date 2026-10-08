# EcomVideoStudio — v1.0.0
Logiciel desktop de montage vidéo pour Windows 10+.

## V1
- Import de nombreux formats via FFmpeg : MP4, MOV, MKV, AVI, WebM, M4V, WMV, FLV, MPEG, MPG, 3GP, MP3, WAV, AAC, M4A, OGG, FLAC.
- Prévisualisation.
- Timeline vidéo + audio.
- Lecture et découpe.
- Ajout de musique/sons.
- Module d'interface pour légendes automatiques.
- Sauvegarde/ouverture de projet.
- Export MP4 H.264 en 480p et 1080p.
- Installateur NSIS + portable.
- Compilation automatique GitHub Actions.

## GitHub
Déposez tout le contenu à la racine d'un dépôt GitHub, puis poussez sur `main`. Le workflow `.github/workflows/build-windows.yml` se lance automatiquement et produit l'installateur dans l'artefact `EcomVideoStudio-Windows` et dans une Release.

## Démarrage local
npm install
npm start

## Export local
npm run dist

## Légendes automatiques
La V1 contient l'interface et la structure du module. Pour un vrai moteur premium de transcription, il faut brancher Whisper large-v3/faster-whisper ou une API cloud. Cela nécessite ensuite de choisir entre moteur local (plus lourd) et API (clé/connexion).
