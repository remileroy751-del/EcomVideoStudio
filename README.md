# EcomVideoStudio — v1.3.0
Logiciel desktop de montage vidéo pour Windows 10+ (Electron + FFmpeg).

## Nouveautés v1.3.0
- **Logo et icône** du logiciel : lettre E + pellicule rouge 3D (fenêtre, installeur, raccourcis).
- **Pied de page** : « Créé par Ecom Academy • Mail : ecom.academy.tg@gmail.com ».
- **Onglet Effets : 41 effets** (couleur, film, mouvement, ambiance dont flammes, étincelles, neige, pluie, confettis…). Sélectionnez un clip, cliquez sur un effet : il s'applique à tout le clip (jusqu'à 4 par clip). Recliquez pour le retirer.
- **Déplacement direct dans l'aperçu** : cliquez un clip ou un sticker dans l'aperçu, glissez-le pour le déplacer, tirez un coin pour changer sa taille.

## Nouveautés v1.2.0
- **Format du projet** sous l'aperçu : 9:16, 16:9, 4:5 ou 1:1 (l'aperçu et l'export suivent le format choisi).
- **Panneau de réglages à droite** : volume, taille, position, Ajuster/Remplir, durée et animation du clip sélectionné. L'aperçu est plus compact.
- **Aperçu immédiat** : un média ajouté s'affiche tout de suite dans l'aperçu (la tête de lecture se place sur le clip) et la timeline montre des vignettes.
- **Onglet Stickers** : 30 stickers animés (apparition « pop », mouvement en boucle, disparition) de 3 s, ajoutables par clic ou glisser-déposer sur V1 à V3, réglables et exportés dans la vidéo.

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
