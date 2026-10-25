/* ====== CONFIGURATION DE LISANGA ======
   Tant que firebase.apiKey est vide, l'application fonctionne en MODE LOCAL :
   tout reste dans ce navigateur (idéal pour essayer à deux, dans deux onglets).
   Pour que des personnes sur des téléphones différents communiquent, suivez GUIDE.md. */
window.LISANGA_CONFIG = {

  /* 1. Firebase (GUIDE.md, étape 2) */
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    appId: ""
  },

  /* 2. Assistant IA (GUIDE.md, étape 4) : l'adresse de votre serveur ia-worker,
        par exemple "https://lisanga-ia.votre-nom.workers.dev". Vide = mode hors ligne. */
  iaEndpoint: "",

  /* 3. Appels (facultatif) : ajoutez un serveur TURN pour les réseaux mobiles difficiles.
        Exemple : [{ urls: "turn:turn.exemple.com:3478", username: "u", credential: "p" }]
        Vide = serveurs STUN publics de Google (suffisants dans la plupart des cas). */
  iceServers: [],

  /* 4. Taille maximale d'un fichier envoyé (Mo) */
  maxUploadMB: 25
};
