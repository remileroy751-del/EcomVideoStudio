# EcomVideoStudio 1.1

Éditeur vidéo de bureau pour Windows, inspiré de CapCut (Electron + FFmpeg).

## Nouveautés de la version 1.1
- **Format du projet** : bouton « Ratio » dans la barre de lecture (9:16, 16:9, 4:5). L'aperçu s'adapte au format choisi, sans jamais déborder. Réglage automatique d'après le premier média ajouté.
- **Bibliothèque en miniatures** : l'import n'ajoute plus rien automatiquement. Vous ajoutez chaque média au projet avec le bouton **＋** (ou double-clic, ou glisser sur la timeline).
- **Barre de lecture** façon CapCut : temps courant/total, lecture/pause, début/fin, curseur de navigation, plein écran.
- **Timeline** : pistes texte/emoji, vidéo/images, audio (avec forme d'onde), règle, tête de lecture, zoom, glisser pour réordonner, poignées pour rogner, couper (Ctrl+B), annuler/rétablir.
- **Texte** : 8 styles prêts à l'emploi, police, taille, couleur, contour, fond, ombre, rotation, fondu, déplacement et redimensionnement directement dans l'aperçu. Rendu identique à l'export.
- **Emoji** : 225 emoji libres (Twemoji, CC-BY 4.0), utilisables comme autocollants.
- **Effets** (19) : noir & blanc, sépia, vintage, éclatant, chaud, froid, cinéma, mat, flou, vignette, négatif, miroir, grain, aberration RVB, pixel…
- **Transitions** (16) : fondu, dissolution, fondu noir, flash blanc, glisser ×4, volets ×4, cercle ouvert/fermé, zoom, pixellisation. Aperçu en direct.
- Vitesse (×0,25 à ×3) et volume par clip ; voix-off sur la piste audio.
- Export MP4 H.264 en 480p / 720p / 1080p avec barre de progression et annulation.

## Lancer en développement
```
npm install
npm start
```

## Obtenir l'exécutable Windows via GitHub
1. Créez un dépôt GitHub et envoyez-y tout le contenu de ce dossier (le dossier `.github` doit être à la racine).
2. L'onglet **Actions** lance « Build EcomVideoStudio Windows » à chaque push sur `main` (ou manuellement via *Run workflow*).
3. Récupérez l'installateur `.exe` dans les **Artifacts** du run, ou dans **Releases**.

## Raccourcis
Espace lecture/pause · Suppr supprimer · Ctrl+B couper · Ctrl+Z / Ctrl+Y annuler/rétablir · ←/→ image par image · Ctrl+molette zoom timeline · F12 outils de développement.

## Notes
- La durée du projet = fin de la piste vidéo principale ; l'audio qui dépasse est coupé à l'export.
- Les effets et transitions de l'aperçu sont des approximations CSS ; l'export utilise les vrais filtres FFmpeg.
- Les légendes automatiques (transcription) ne sont pas incluses ; les légendes manuelles le sont.
- Régénérer les emoji : `npm run build:emoji`.
- Licences tierces : voir `THIRD_PARTY_NOTICES.md`.
