// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"; // <-- ADICIONE ESTA LINHA
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDhQ_9FcpFbqCI8-W7tfZOxcUnB2nnAG2w",
  authDomain: "espelho-digital-vca.firebaseapp.com",
  projectId: "espelho-digital-vca",
  storageBucket: "espelho-digital-vca.appspot.com", // CORRIGIDO: O seu tinha .firebasestorage.app
  messagingSenderId: "178826599356",
  appId: "1:178826599356:web:e818a2115ebc34c5bba9b9",
  measurementId: "G-75WPWV0E94",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app); // <-- ADICIONE ESTA LINHA
