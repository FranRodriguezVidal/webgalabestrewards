import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAsSJ2ax2BxL8SqVRBbYA0gnfieebrBcGs",
  authDomain: "webgalabestrewards.firebaseapp.com",
  projectId: "webgalabestrewards",
  storageBucket: "webgalabestrewards.firebasestorage.app",
  messagingSenderId: "353464406820",
  appId: "1:353464406820:web:7273fa66f93b36d49019b1"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
