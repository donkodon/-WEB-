/**
 * Login Page Logic
 * Handles email/password and Google OAuth authentication
 */

import { 
  auth, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider 
} from './firebase-config.js'

// DOM Elements
const loginForm = document.getElementById('loginForm')
const googleLoginBtn = document.getElementById('googleLogin')
const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const togglePasswordBtn = document.getElementById('togglePassword')
const eyeIcon = document.getElementById('eyeIcon')
const loginButton = document.getElementById('loginButton')
const errorMessage = document.getElementById('errorMessage')
const errorText = document.getElementById('errorText')
const loadingOverlay = document.getElementById('loadingOverlay')

// Password visibility toggle
togglePasswordBtn?.addEventListener('click', () => {
  const type = passwordInput.type === 'password' ? 'text' : 'password'
  passwordInput.type = type
  eyeIcon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash'
})

// Show/hide error message
function showError(message) {
  errorText.textContent = message
  errorMessage.classList.remove('hidden')
  setTimeout(() => {
    errorMessage.classList.add('hidden')
  }, 5000)
}

function hideError() {
  errorMessage.classList.add('hidden')
}

// Show/hide loading overlay
function showLoading() {
  loadingOverlay.classList.remove('hidden')
  loginButton.disabled = true
}

function hideLoading() {
  loadingOverlay.classList.add('hidden')
  loginButton.disabled = false
}

// Handle successful login
async function handleLoginSuccess(userCredential) {
  try {
    // Get Firebase ID token
    const idToken = await userCredential.user.getIdToken()
    
    // Store token in localStorage
    localStorage.setItem('firebase_token', idToken)
    localStorage.setItem('user_email', userCredential.user.email)
    localStorage.setItem('user_uid', userCredential.user.uid)
    
    console.log('✅ Login successful:', userCredential.user.email)
    
    // Redirect to dashboard
    window.location.href = '/dashboard'
    
  } catch (error) {
    console.error('❌ Token storage error:', error)
    showError('ログインに成功しましたが、トークンの保存に失敗しました')
    hideLoading()
  }
}

// Email/Password login
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault()
  hideError()
  showLoading()
  
  const email = emailInput.value.trim()
  const password = passwordInput.value
  
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    await handleLoginSuccess(userCredential)
    
  } catch (error) {
    console.error('❌ Login error:', error)
    hideLoading()
    
    // User-friendly error messages
    switch (error.code) {
      case 'auth/invalid-email':
        showError('メールアドレスの形式が正しくありません')
        break
      case 'auth/user-disabled':
        showError('このアカウントは無効化されています')
        break
      case 'auth/user-not-found':
        showError('メールアドレスまたはパスワードが間違っています')
        break
      case 'auth/wrong-password':
        showError('メールアドレスまたはパスワードが間違っています')
        break
      case 'auth/too-many-requests':
        showError('ログイン試行回数が多すぎます。しばらくしてから再試行してください')
        break
      case 'auth/network-request-failed':
        showError('ネットワークエラーが発生しました。インターネット接続を確認してください')
        break
      default:
        showError(`ログインに失敗しました: ${error.message}`)
    }
  }
})

// Google login
googleLoginBtn?.addEventListener('click', async () => {
  hideError()
  showLoading()
  
  const provider = new GoogleAuthProvider()
  
  try {
    const result = await signInWithPopup(auth, provider)
    await handleLoginSuccess(result)
    
  } catch (error) {
    console.error('❌ Google login error:', error)
    hideLoading()
    
    switch (error.code) {
      case 'auth/popup-closed-by-user':
        showError('ログインがキャンセルされました')
        break
      case 'auth/popup-blocked':
        showError('ポップアップがブロックされました。ブラウザの設定を確認してください')
        break
      case 'auth/cancelled-popup-request':
        // User closed popup, no need to show error
        break
      default:
        showError(`Googleログインに失敗しました: ${error.message}`)
    }
  }
})

// Check if already logged in
auth.onAuthStateChanged((user) => {
  const isLoginPage = window.location.pathname === '/login.html' || 
                      window.location.pathname === '/firebase-login' ||
                      window.location.pathname === '/legacy-login'
  
  if (user && isLoginPage) {
    console.log('✅ Already logged in, redirecting to dashboard')
    window.location.href = '/dashboard'
  }
})
