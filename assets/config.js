window.REVISOR_CONFIG = {
  // Backend seguro para IA, intentos, informes y autenticación administrativa.
  // Se configurará cuando exista el servicio. Las claves privadas nunca deben ir en GitHub Pages.
  API_BASE_URL: "",

  // Firestore público usado únicamente para consultar el registro del estudiante por cédula.
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

  // Mantener disponible solo para revisar la interfaz mientras se conecta el backend seguro.
  DEMO_MODE: true,
  INSTITUTION: "ITSQMET",
  APP_NAME: "Revisión Académica"
};