window.REVISOR_CONFIG = {
  // Backend seguro para IA, intentos compartidos, informes persistentes y secretos.
  // Cuando exista, coloca aquí su URL pública.
  API_BASE_URL: "",

  FIREBASE: {
    apiKey: "AIzaSyCaHf1C0BB0X_H3BDZ1o-UDAsPmLTjsZLA",
    authDomain: "utet-4387a.firebaseapp.com",
    projectId: "utet-4387a",
    storageBucket: "utet-4387a.firebasestorage.app",
    messagingSenderId: "902848131454",
    appId: "1:902848131454:web:47f515eb6480834724c32f",
    databaseId: "(default)",
    studentCollection: "Estudiante"
  },

  // Credencial administrativa validada por hash para no publicar el PIN en texto plano.
  // SHA-256 de usuario:PIN.
  ADMIN_LOGIN_HASH: "c0d8715a560af5e884b31c8957f8618ef12c2959476f7423e2dbf338872caf9b",

  DEMO_MODE: false,
  INSTITUTION: "ITSQMET",
  APP_NAME: "Revisión Académica"
};
