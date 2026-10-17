# EcomVideoStudio — v1.1.0
Logiciel desktop de montage vidéo pour Windows 10+ (Electron + FFmpeg).

## Nouveautés v1.1.0
- **3 pistes vidéo superposables (V1, V2, V3)** : glissez des vidéos ou des photos depuis l'onglet Médias (ou depuis l'Explorateur Windows) sur une piste. V3 passe au-dessus de V2, qui passe au-dessus de V1.
- **3 pistes audio** : A1 par défaut ; A2 et A3 se créent en glissant un son sur la zone « nouvelle piste » ou avec le bouton **＋ Ajouter piste audio**.
- Réglages par clip : volume, taille, position (incrustation façon CapCut), rognage par les bords, coupe à la tête de lecture, déplacement entre pistes.
- **Légendes automatiques** : bouton « Générer les légendes » (onglet Légendes). Transcription en ligne (Whisper via Groq, clé gratuite, ou OpenAI), légendes éditables, incrustées dans l'export.
- Export MP4 H.264 (480p / 1080p) avec toutes les pistes mixées.

## Légendes : configuration (une seule fois)
1. Créez une clé API gratuite sur https://console.groq.com/keys (ou utilisez une clé OpenAI).
2. Onglet **Légendes** → collez la clé → **Enregistrer la clé**.
3. Choisissez la langue puis **Générer les légendes**.

## GitHub
Déposez tout le contenu à la racine du dépôt, puis poussez sur `main`. Le workflow `.github/workflows/build-windows.yml` compile l'installateur (publication GitHub d'electron-builder désactivée : `--publish never`) et le met dans l'artefact `EcomVideoStudio-Windows` et dans une Release.

## Raccourcis
Espace : lecture/pause • Suppr : supprimer le clip sélectionné.

## Développement local
npm install
npm start
npm run dist
