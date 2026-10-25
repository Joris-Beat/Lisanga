# Journal des versions de Lisanga

Chaque modification future ajoutera une nouvelle version en haut de ce fichier (V1.1, V1.2…).
Le même texte s'affiche dans l'application : **Moi > À propos > Nouveautés**.

## V1.0.0 — première version

### Chat (base de l'application)
- Discussions privées et **groupes** (administrateurs, ajout/retrait de membres)
- **Chiffrement de bout en bout** : textes, vocaux, photos, vidéos, fichiers (ECDH P-256 + AES-GCM 256)
- **Messages vocaux** avec forme d'onde, pause, vitesse 1×/1,5×/2×
- **Appels audio et vidéo** (WebRTC), changement de caméra, partage d'écran, journal d'appels
- Réponses, **réactions**, transfert, modification (15 min), suppression pour tous (48 h)
- **Messages éphémères** (24 h, 7 j, 90 j), accusés de lecture ✓✓, « écrit… », en ligne / vu à
- Photos, vidéos, documents, position, émojis, recherche, brouillons, épingler, sourdine
- **IA dans la saisie** : suggérer une réponse, corriger, traduire (FR/EN/lingala/swahili), résumer

### Star
- **Stories 24 h** (photo, vidéo, texte) avec vues, j'aime et réponses en privé
- Photos et vidéos avec **8 filtres maison**, lieux, j'aime (double-touche), commentaires, enregistrements
- Explorer, suggestions, activité, demandes d'abonnement (comptes privés)

### Fun
- Fil vertical plein écran « Pour toi » / « Abonnements », lecture automatique
- Double-touche ❤️, commentaires, partages, vues, son activé/coupé
- Création : **caméra (jusqu'à 60 s)**, import de vidéo, clips texte animés

### Publique
- Fil d'actualité, **statuts sur fond coloré**, humeurs, photos/vidéos, visibilité Public/Abonnés
- **6 réactions** (👍❤️😆😮😢😡), commentaires, partages, **republication**, suggestions d'amis
- Rédaction assistée par l'IA

### IA
- Lisa, assistante propulsée par **Claude** (via votre serveur ia-worker), analyse de photos
- Mode hors ligne intégré si aucun serveur n'est configuré

### Sécurité
- Verrouillage par code + floutage en arrière-plan, appareils connectés, changement de mot de passe
- Confidentialité : vu à, accusés de lecture, compte privé, qui peut m'écrire, blocage, signalement
- Numéro de sécurité pour vérifier un contact, règles Firestore strictes, limitation des tentatives

### À venir (V1.1 et suivantes)
- Appels de groupe, rotation des clés de groupe, sondages, statuts dans Chat, notifications push hors ligne
