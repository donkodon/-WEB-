/**
 * Firebase Configuration for Web App
 * 
 * Firebase Project: saisunsatsuei-950cf
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
import { 
  getAuth, 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'

// Firebase configuration
// Note: These are public keys, safe to expose in frontend
const firebaseConfig = {
  apiKey: "AIzaSyCwX78eJSDWS6Jat8yx-w3lh8IFS3Xyb08",
  authDomain: "saisunsatsuei-950cf.firebaseapp.com",
  projectId: "saisunsatsuei-950cf",
  storageBucket: "saisunsatsuei-950cf.firebasestorage.app",
  messagingSenderId: "788734188363",
  appId: "1:788734188363:web:9a8c2c8f89f4554bdda6ce"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

// Export Firebase modules
export { 
  auth, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
}
