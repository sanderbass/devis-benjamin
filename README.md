# Mes devis

Logiciel de devis pour électricien, fait pour Benjamin : une petite app web gratuite qui marche sur iPhone et sur ordinateur, même sans réseau.

## Ce qu'il fait (V1)
- **Articles** : référence Rexel, désignation, famille, unité, prix d'achat HT et date du prix (recopié depuis l'appli REXEL.FR).
- **Marges** : coefficient par famille, ou par article.
- **Main-d'œuvre** : taux horaires et forfaits.
- **Devis** : client, chantier, titres par pièce, articles, main-d'œuvre, lignes libres ; TVA 20 / 10 / 5,5 % ou franchise (auto-entrepreneur) ; remise, acompte ; marge visible ou cachée.
- **PDF** : fabriqué dans l'appareil (jsPDF) et envoyé par la feuille de partage de l'iPhone.
- **Sauvegarde** : fichier JSON à garder ou à reprendre sur un autre appareil.

Les données restent dans l'appareil (localStorage). Pas de serveur, pas de compte.

## Installer sur l'iPhone
Ouvrir le lien dans Safari → bouton Partager → « Sur l'écran d'accueil ».

## Prix Rexel automatiques (plus tard)
Voir `prix.js` : renseigner `urlServeur` vers un petit serveur qui garde la clé de l'API Rexel. La clé ne doit jamais être mise dans ce dépôt.

## Développement
Aucun outil à installer : ouvrir `index.html` via un petit serveur local (`python3 -m http.server`). À chaque mise en ligne, changer `VERSION` dans `sw.js`.

Bibliothèques incluses : jsPDF et jspdf-autotable (licence MIT, dans `vendor/`).

## Transférer le dépôt à Benjamin
Le dépôt est sur le compte de Sander pour démarrer. Rien dans le code ne dépend de ce compte : chemins relatifs, aucun secret.
1. Benjamin crée son compte GitHub.
2. **Avant le transfert, Benjamin fait une sauvegarde** dans l'appli (Réglages → Faire une sauvegarde). Les données sont liées à l'adresse du site, et cette adresse va changer.
3. Sur GitHub : Settings → General → Danger Zone → Transfer ownership, vers le compte de Benjamin.
4. Sur le dépôt transféré, réactiver Pages (Settings → Pages → branche `main`, dossier `/`). La nouvelle adresse sera `https://<compte-de-benjamin>.github.io/devis-benjamin/`.
5. Benjamin ouvre la nouvelle adresse, l'ajoute à l'écran d'accueil, puis Réglages → Reprendre une sauvegarde.
6. Benjamin invite Sander comme collaborateur s'il veut qu'il garde la main.
