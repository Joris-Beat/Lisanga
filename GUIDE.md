# Lisanga — guide de mise en ligne, pas à pas

**Lisanga** (« ensemble » en lingala) est une application web de discussion et de réseau social, avec votre propre design :

| Onglet | Inspiré de | Ce qu'on y fait |
|---|---|---|
| **Chat** (la base) | WhatsApp | Messages chiffrés, groupes, vocaux, photos, vidéos, fichiers, appels audio et vidéo |
| **Star** | Instagram | Stories 24 h, photos avec filtres, explorer, enregistrements |
| **Fun** | TikTok | Vidéos courtes en plein écran, double-touche ❤️, création à la caméra |
| **Publique** | Facebook | Fil d'actualité, statuts colorés, 6 réactions, commentaires, republication |
| **IA** | — | Lisa, l'assistante (propulsée par Claude d'Anthropic) |
| **Moi** | — | Profil, sécurité, confidentialité, thème |

Les noms des boutons dans Firebase, Netlify ou Cloudflare peuvent changer un peu avec le temps : cherchez le bouton le plus proche.

---

## 0. Le contenu du dossier

```
lisanga/
├── index.html            La page
├── config.js             VOS réglages : Firebase, serveur IA, serveurs d'appel
├── firestore.rules       Règles de sécurité (à coller dans Firebase)
├── manifest.webmanifest  Installation comme une application (téléphone, ordinateur)
├── sw.js                 Fonctionnement avec une connexion faible
├── _headers              En-têtes de sécurité (Netlify / Cloudflare Pages)
├── CHANGELOG.md          Journal des versions (V1.0, puis V1.1…)
├── css/style.css         Apparence et couleurs
├── img/                  Icônes
├── js/core/              Le moteur : base de données, chiffrement, médias, comptes, appels…
├── js/tabs/              Un fichier par onglet : chat, star, fun, publique, ia, profile
└── ia-worker/            Le petit serveur de l'IA (Cloudflare Worker)
```

Gardez cette organisation : l'ordre de chargement est écrit dans `index.html`.

---

## 1. Essayer tout de suite (mode local, sans rien configurer)

Le chiffrement exige une adresse `https://` ou `localhost`. Ouvrir `index.html` en double-cliquant ne suffit pas.

1. Installez Python (ou utilisez n'importe quel petit serveur web).
2. Dans le dossier `lisanga`, lancez : `python -m http.server 8787`
3. Ouvrez **http://localhost:8787** dans Chrome, Edge ou Firefox.
4. Cliquez sur **Créer les comptes de démonstration**. Trois comptes sont créés (mot de passe `demo1234`) :
   `amani@demo.cd`, `grace@demo.cd`, `kevin@demo.cd`.
5. Connectez-vous avec Amani. Ouvrez un **deuxième onglet** à la même adresse et connectez-vous avec Grâce.
6. Écrivez-vous, envoyez un vocal, appelez-vous en vidéo : tout se passe en direct entre les deux onglets.

En mode local, les données restent dans ce navigateur. Pour communiquer entre téléphones différents, suivez l'étape 2.

---

## 2. Créer la base de données Firebase (gratuit, sans carte bancaire)

### 2.1 Le projet
1. Allez sur **https://console.firebase.google.com** et connectez-vous avec un compte Google.
2. **Créer un projet** → nom : `lisanga` → désactivez Google Analytics → **Créer le projet**.

### 2.2 Les comptes
1. Menu **Build** (Compiler) → **Authentication** → **Commencer**.
2. Onglet **Sign-in method** → **E-mail/Mot de passe** → activez le premier interrupteur → **Enregistrer**.

### 2.3 La base de données
1. **Build** → **Firestore Database** → **Créer une base de données**.
2. Emplacement : `eur3 (europe-west)` (proche de l'Afrique centrale) → **Suivant**.
3. Choisissez **Démarrer en mode production** → **Créer**.

### 2.4 Les règles de sécurité (obligatoire)
1. Dans Firestore, onglet **Règles**.
2. Effacez tout, collez le contenu du fichier `firestore.rules`, puis **Publier**.

### 2.5 Vos valeurs de connexion
1. Roue dentée ⚙️ → **Paramètres du projet** → en bas, **Vos applications** → icône **`</>`** (Web).
2. Surnom : `lisanga-web` → **Enregistrer l'application**.
3. Copiez les valeurs `apiKey`, `authDomain`, `projectId`, `appId` dans `config.js`, partie `firebase` :

```js
firebase: {
  apiKey: "AIza...",
  authDomain: "lisanga-xxxx.firebaseapp.com",
  projectId: "lisanga-xxxx",
  appId: "1:123...:web:abc..."
},
```

Ces valeurs ne sont pas secrètes : c'est normal qu'elles soient visibles. La sécurité vient des règles de l'étape 2.4.

> **Photos et vidéos sans carte bancaire** : Lisanga découpe les fichiers en morceaux dans Firestore, ce qui fonctionne avec le plan gratuit. Le plan gratuit permet environ 1 Go de données et 20 000 écritures par jour, largement assez pour démarrer. Pour une grande communauté, passez au plan Blaze.

---

## 3. Mettre le site en ligne (gratuit)

### Option A : Netlify (la plus simple)
1. Allez sur **https://app.netlify.com/drop**.
2. Faites glisser **le dossier `lisanga`** entier dans la page.
3. Netlify donne une adresse du type `https://nom-aleatoire-123.netlify.app`. Vous pouvez la renommer dans **Site configuration → Change site name**.

### Option B : Cloudflare Pages
1. **https://dash.cloudflare.com** → **Workers & Pages** → **Créer** → **Pages** → **Charger des ressources**.
2. Nom du projet : `lisanga` → glissez le dossier `lisanga` → **Déployer**.

### Autoriser votre adresse dans Firebase
Firebase → **Authentication** → **Paramètres** → **Domaines autorisés** → **Ajouter un domaine** → collez votre adresse sans `https://` (ex. `lisanga.netlify.app`).

### Installer sur le téléphone
Ouvrez votre adresse dans Chrome (Android) ou Safari (iPhone) → menu → **Ajouter à l'écran d'accueil**. Lisanga s'ouvre alors comme une vraie application.

---

## 4. Activer l'assistant IA (Claude d'Anthropic)

Sans cette étape, l'onglet IA fonctionne en **mode hors ligne** (réponses simples). Pour l'assistant complet :

### 4.1 La clé API
1. Créez un compte sur **https://console.anthropic.com**, ajoutez un moyen de paiement (facturation à l'usage).
2. **API Keys** → **Create Key** → copiez la clé (elle commence par `sk-ant-`). Ne la mettez **jamais** dans `config.js`.

### 4.2 Le serveur IA (Cloudflare Workers, gratuit jusqu'à 100 000 requêtes/jour)
Il faut Node.js (https://nodejs.org, version LTS) sur votre ordinateur.

1. Ouvrez `ia-worker/wrangler.toml` et remplacez `https://votre-site.netlify.app` par l'adresse réelle de votre site.
2. Dans un terminal, dans le dossier `ia-worker` :
   ```
   npm install
   npx wrangler login
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler deploy
   ```
   (À la commande `secret put`, collez votre clé API.)
3. Wrangler affiche une adresse comme `https://lisanga-ia.votre-nom.workers.dev`.
4. Collez-la dans `config.js` : `iaEndpoint: "https://lisanga-ia.votre-nom.workers.dev",` puis remettez le site en ligne (étape 3).

Le serveur n'accepte que les demandes venant de votre site, limite le nombre de demandes par personne et garde la clé secrète. Le modèle utilisé est **Claude Opus 5.5** (modifiable dans `wrangler.toml`, ligne `MODEL`).

---

## 5. Appels sur réseaux mobiles (facultatif)

Les appels utilisent les serveurs STUN publics de Google, ce qui marche dans la plupart des cas. Sur certains réseaux mobiles ou d'entreprise, il faut un serveur **TURN** (relais). Des services comme Metered, Twilio ou Cloudflare Calls en proposent. Ajoutez-le dans `config.js` :

```js
iceServers: [{ urls: "turn:turn.exemple.com:3478", username: "utilisateur", credential: "motdepasse" }],
```

---

## 6. La sécurité dans Lisanga

- **Chiffrement de bout en bout** des discussions : textes, vocaux, photos, vidéos, fichiers. Chaque compte a une paire de clés (ECDH P-256) ; les messages sont chiffrés en AES-GCM 256 bits **dans le téléphone**. Firebase ne voit que du charabia.
- **Clé privée** : elle reste sur vos appareils. Une copie de secours est chiffrée avec votre mot de passe (PBKDF2, 310 000 tours) pour vous reconnecter sur un nouvel appareil.
- **Appels** : de pair à pair, chiffrés par le navigateur (DTLS-SRTP).
- **Numéro de sécurité** dans les infos d'une discussion : comparez-le avec votre contact pour vérifier qu'il n'y a pas d'intermédiaire.
- **Verrouillage par code**, floutage en arrière-plan, messages éphémères, blocage, signalement, compte privé, « qui peut m'écrire », vu à, accusés de lecture, appareils connectés.
- **Règles Firestore** : chacun ne lit que ses discussions et ne modifie que son propre contenu.

**À savoir :**
- Si quelqu'un **réinitialise son mot de passe** par e-mail, ses anciens messages chiffrés deviennent illisibles (comme sur WhatsApp sans sauvegarde). Changer son mot de passe depuis **Moi > Sécurité** garde l'historique.
- Les **signalements** se consultent dans Firebase → Firestore → collection `reports`.
- Les publications Star, Fun et Publique sont **publiques** (non chiffrées), sauf compte privé.

---

## 7. Mettre à jour l'application (V1.1, V1.2…)

1. Modifiez les fichiers.
2. Augmentez le numéro dans `js/core/utils.js` (`APP_VERSION`) et dans `sw.js` (`VERSION`), ajoutez la version en haut de `CHANGELOG.md` et dans `js/core/brand.js` (`CHANGELOG`).
3. Netlify : **Deploys** → glissez à nouveau le dossier `lisanga`. Cloudflare : **Créer un déploiement** → glissez le dossier.

---

## 8. Où modifier quoi

| Je veux changer… | Fichier |
|---|---|
| Les couleurs, polices, arrondis | `css/style.css` (tout en haut, section « Couleurs ») |
| Le logo | `js/core/brand.js` (`LOGO`) et `img/icon.svg` |
| Les textes de l'onglet Chat | `js/tabs/chat.js` |
| Stories et photos | `js/tabs/star.js` |
| Vidéos courtes | `js/tabs/fun.js` |
| Fil d'actualité | `js/tabs/publique.js` |
| L'assistante IA (personnalité) | `js/tabs/ia.js` (`SYSTEM`) |
| Les paramètres et le profil | `js/tabs/profile.js` |
| Les limites de taille des fichiers | `config.js` (`maxUploadMB`) |

---

## 9. Dépannage

| Problème | Solution |
|---|---|
| Page blanche | Ouvrez-la via `https://` ou `localhost`, pas en double-cliquant le fichier. |
| « Missing or insufficient permissions » | Recollez `firestore.rules` (étape 2.4) et cliquez sur **Publier**. |
| La connexion échoue en ligne | Ajoutez votre adresse dans les **Domaines autorisés** (étape 3). |
| Pas de son ni d'image en appel | Autorisez micro et caméra (icône 🔒 à gauche de l'adresse). Sur réseau mobile difficile : étape 5. |
| « Serveur IA injoignable » | Vérifiez `iaEndpoint` dans `config.js` et `ALLOWED_ORIGINS` dans `ia-worker/wrangler.toml`. |
| Je ne vois pas la dernière version | Fermez et rouvrez l'application (le service worker se met à jour). |

---

## 10. Limites de la V1.0

- Appels **à deux** uniquement (appels de groupe prévus).
- Notifications quand l'application est **ouverte** (en arrière-plan ou au premier plan) ; les notifications push application fermée nécessitent Firebase Cloud Messaging (prévu).
- L'annuaire charge jusqu'à 2 000 profils : parfait pour une communauté, à faire évoluer au-delà.
- Retirer un membre d'un groupe lui coupe l'accès (règles Firestore) ; la rotation automatique de la clé du groupe est prévue.
