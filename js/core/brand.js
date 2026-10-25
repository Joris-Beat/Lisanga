/* Lisanga — Identité visuelle (logo maison) et journal des versions */
'use strict';

/* « Lisanga » signifie « ensemble, réunion » en lingala : deux bulles qui se rejoignent. */
const LOGO='<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 15C8 9.5 12.5 5 18 5h17c5.5 0 10 4.5 10 10v9c0 5.5-4.5 10-10 10H21l-9 7.5V32.6C9.6 30.9 8 27.6 8 24z" fill="url(#lsg-a)"/><path d="M56 31c0-5.5-4.5-10-10-10H30c-5.5 0-10 4.5-10 10v9c0 5.5 4.5 10 10 10h13l9 7.5v-9C54.4 46.9 56 43.6 56 40z" fill="url(#lsg-b)" opacity=".93"/><circle cx="31" cy="35.5" r="2.4" fill="#fff"/><circle cx="38" cy="35.5" r="2.4" fill="#fff"/><circle cx="45" cy="35.5" r="2.4" fill="#fff"/></svg>';
/* Les dégradés du logo sont définis une seule fois dans index.html (#lsg-defs) */
const LOGO_SMALL=LOGO.replace('class="logo"','class="logo sm"');

const CHANGELOG=`# Lisanga V1.0.0 — première version

## Chat (base de l'application)
- Discussions privées et **groupes** (administrateurs, ajout/retrait de membres)
- **Chiffrement de bout en bout** : textes, vocaux, photos, vidéos, fichiers (ECDH P-256 + AES-GCM 256)
- **Messages vocaux** avec forme d'onde, pause, vitesse 1×/1,5×/2×
- **Appels audio et vidéo** (WebRTC), changement de caméra, partage d'écran, journal d'appels
- Réponses, **réactions**, transfert, modification (15 min), suppression pour tous (48 h)
- **Messages éphémères** (24 h, 7 j, 90 j), accusés de lecture ✓✓, « écrit… », en ligne / vu à
- Photos, vidéos, documents, position, émojis, recherche, brouillons, épingler, sourdine
- **IA dans la saisie** : suggérer une réponse, corriger, traduire (FR/EN/lingala/swahili), résumer

## Star
- **Stories 24 h** (photo, vidéo, texte) avec vues, j'aime et réponses en privé
- Photos et vidéos avec **8 filtres maison**, lieux, j'aime (double-touche), commentaires, enregistrements
- Explorer, suggestions, activité, demandes d'abonnement (comptes privés)

## Fun
- Fil vertical plein écran « Pour toi » / « Abonnements », lecture automatique
- Double-touche ❤️, commentaires, partages, vues, son activé/coupé
- Création : **caméra (jusqu'à 60 s)**, import de vidéo, clips texte animés

## Publique
- Fil d'actualité, **statuts sur fond coloré**, humeurs, photos/vidéos, visibilité Public/Abonnés
- **6 réactions** (👍❤️😆😮😢😡), commentaires, partages, **republication**, suggestions d'amis
- Rédaction assistée par l'IA

## IA
- Lisa, assistante propulsée par **Claude** (via votre serveur ia-worker), analyse de photos
- Mode hors ligne intégré si aucun serveur n'est configuré

## Sécurité
- Verrouillage par code + floutage en arrière-plan, appareils connectés, changement de mot de passe
- Confidentialité : vu à, accusés de lecture, compte privé, qui peut m'écrire, blocage, signalement
- Numéro de sécurité pour vérifier un contact, règles Firestore strictes, limitation des tentatives

## À venir (V1.1 et suivantes)
- Appels de groupe, rotation des clés de groupe, sondages, statuts dans Chat, notifications push hors ligne
`;
