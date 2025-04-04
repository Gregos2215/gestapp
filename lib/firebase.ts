import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAwo15HISsZSO3VvkPB6lyPOrXN6hozycI",
  authDomain: "gestapp2-879ac.firebaseapp.com",
  projectId: "gestapp2-879ac",
  storageBucket: "gestapp2-879ac.firebasestorage.app",
  messagingSenderId: "280996040024",
  appId: "1:280996040024:web:da724ae174bf3ef748e92d"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage }; 