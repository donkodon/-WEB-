import { Hono } from 'hono'
import type { AppEnv } from '../types/bindings'
import { Layout } from '../components'
import { FIXED_COMPANY_ID } from '../helpers/auth'
import { logger } from '../helpers/logger'

const auth = new Hono<AppEnv>()

// Serve Firebase login page (inline HTML since we can't use fs in Workers)
auth.get('/firebase-login', async (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ログイン - SmartMeasure</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .glass-effect {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
    }
    .input-group:focus-within label {
      color: #4F46E5;
    }
    .input-group:focus-within i {
      color: #4F46E5;
    }
    @keyframes float {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
      100% { transform: translateY(0px); }
    }
    .float-animation {
      animation: float 6s ease-in-out infinite;
    }
  </style>
</head>
<body class="bg-gray-50 h-screen overflow-hidden flex">
  
  <!-- Left Side: Login Form -->
  <div class="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 relative z-10">
    <div class="max-w-md w-full bg-white/50 backdrop-blur-sm p-8 sm:p-10 rounded-3xl shadow-xl border border-white/50 relative overflow-hidden">
      <!-- Decorative background blob -->
      <div class="absolute -top-20 -right-20 w-64 h-64 bg-indigo-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
      <div class="absolute -bottom-20 -left-20 w-64 h-64 bg-pink-100 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
      
      <div class="relative z-10">
        <div class="flex items-center justify-center mb-8">
          <div class="bg-gradient-to-tr from-indigo-600 to-purple-600 text-white p-3 rounded-xl shadow-lg shadow-indigo-200 mr-3 transform rotate-3">
            <i class="fas fa-ruler-combined text-2xl"></i>
          </div>
          <span class="font-bold text-2xl tracking-tight text-gray-900">Smart<span class="text-indigo-600">Measure</span></span>
        </div>
        
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold text-gray-900 mb-2">おかえりなさい</h2>
          <p class="text-gray-500 text-sm">サプライチェーン最適化のための次世代採寸プラットフォーム</p>
        </div>

        <form id="loginForm" class="space-y-6">
          <div class="input-group">
            <label for="email" class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 transition-colors duration-200">
              メールアドレス
            </label>
            <div class="relative group">
              <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i class="fas fa-envelope text-gray-400 transition-colors duration-200 group-hover:text-gray-500"></i>
              </div>
              <input 
                type="email" 
                id="email" 
                required
                class="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent transition-all duration-200 sm:text-sm"
                placeholder="name@company.com"
              >
            </div>
          </div>
          
          <div class="input-group">
            <div class="flex justify-between items-center mb-2">
              <label for="password" class="block text-xs font-semibold text-gray-500 uppercase tracking-wider transition-colors duration-200">
                パスワード
              </label>
              <a href="#" class="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors">パスワードをお忘れですか？</a>
            </div>
            <div class="relative group">
              <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i class="fas fa-lock text-gray-400 transition-colors duration-200 group-hover:text-gray-500"></i>
              </div>
              <input 
                type="password" 
                id="password" 
                required
                class="block w-full pl-11 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent transition-all duration-200 sm:text-sm"
                placeholder="••••••••"
              >
              <button 
                type="button"
                id="togglePassword"
                class="absolute right-0 top-0 h-full px-4 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
              >
                <i class="fas fa-eye" id="eyeIcon"></i>
              </button>
            </div>
          </div>
          
          <button 
            type="submit"
            id="loginButton"
            class="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-indigo-200 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transform transition-all duration-200 hover:-translate-y-0.5"
          >
            <span class="flex items-center">
              ログインして開始
              <i class="fas fa-arrow-right ml-2 text-xs"></i>
            </span>
          </button>
        </form>
        
        <div class="mt-8">
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-200"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white text-gray-500">その他のログイン方法</span>
            </div>
          </div>

          <div class="mt-6 grid grid-cols-2 gap-4">
            <button id="googleLogin" type="button" class="flex items-center justify-center px-4 py-2.5 border border-gray-200 rounded-xl shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <img class="h-5 w-5 mr-2" src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google">
              Google
            </button>
            <button class="flex items-center justify-center px-4 py-2.5 border border-gray-200 rounded-xl shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <i class="fab fa-microsoft text-blue-500 text-lg mr-2"></i>
              Microsoft
            </button>
          </div>
        </div>

        <div id="errorMessage" class="mt-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg text-red-700 text-sm hidden animate-pulse">
          <div class="flex items-start">
            <i class="fas fa-exclamation-circle mt-0.5 mr-2 flex-shrink-0"></i>
            <span id="errorText">ログインに失敗しました</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="mt-8 text-center text-xs text-gray-400">
      &copy; 2024 SmartMeasure. All rights reserved.
      <div class="mt-2 space-x-4">
        <a href="#" class="hover:text-gray-600 transition-colors">プライバシーポリシー</a>
        <a href="#" class="hover:text-gray-600 transition-colors">利用規約</a>
        <a href="#" class="hover:text-gray-600 transition-colors">ヘルプ</a>
      </div>
    </div>
  </div>
  
  <!-- Right Side: Hero Image & Content -->
  <div class="hidden lg:block lg:w-1/2 relative bg-gray-900 overflow-hidden">
    <!-- Background Image with Overlay -->
    <div class="absolute inset-0">
      <img src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=2070&auto=format&fit=crop" alt="Logistics Warehouse" class="w-full h-full object-cover opacity-60 scale-105 transform transition-transform duration-[20s] hover:scale-110 ease-linear">
      <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-indigo-900/30"></div>
    </div>
    
    <!-- Content Overlay -->
    <div class="absolute inset-0 flex flex-col justify-between p-16 z-10 text-white">
      <div class="flex justify-end">
        <div class="bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide flex items-center">
          <span class="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
          SYSTEM OPERATIONAL
        </div>
      </div>
      
      <div>
        <div class="mb-8 space-y-2">
          <h1 class="text-5xl font-bold leading-tight tracking-tight">
            物流の未来を、<br>
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">データで切り拓く。</span>
          </h1>
          <p class="text-xl text-gray-300 max-w-lg font-light leading-relaxed">
            AIによる高精度な採寸とシームレスなデータ連携で、フルフィルメント業務を劇的に効率化します。
          </p>
        </div>
        
        <!-- Feature Cards -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-gray-800/40 backdrop-blur-md border border-gray-700/50 p-4 rounded-xl hover:bg-gray-800/60 transition-colors duration-300">
            <div class="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center mb-3">
              <i class="fas fa-magic text-indigo-400"></i>
            </div>
            <h3 class="font-semibold text-lg mb-1">AI背景除去</h3>
            <p class="text-xs text-gray-400">撮影画像の背景を瞬時に自動処理し、EC品質へ変換。</p>
          </div>
          <div class="bg-gray-800/40 backdrop-blur-md border border-gray-700/50 p-4 rounded-xl hover:bg-gray-800/60 transition-colors duration-300">
            <div class="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center mb-3">
              <i class="fas fa-chart-line text-emerald-400"></i>
            </div>
            <h3 class="font-semibold text-lg mb-1">データ分析</h3>
            <p class="text-xs text-gray-400">採寸データをリアルタイムで分析し、在庫管理を最適化。</p>
          </div>
        </div>
      </div>
      
      <div class="flex items-center space-x-4 text-sm text-gray-400">
        <div class="flex -space-x-2">
          <img class="w-8 h-8 rounded-full border-2 border-gray-900" src="https://i.pravatar.cc/100?img=33" alt="User">
          <img class="w-8 h-8 rounded-full border-2 border-gray-900" src="https://i.pravatar.cc/100?img=47" alt="User">
          <img class="w-8 h-8 rounded-full border-2 border-gray-900" src="https://i.pravatar.cc/100?img=12" alt="User">
          <div class="w-8 h-8 rounded-full border-2 border-gray-900 bg-gray-700 flex items-center justify-center text-xs text-white font-medium">+2k</div>
        </div>
        <p>2,000社以上の物流拠点で導入されています</p>
      </div>
    </div>
  </div>

  <!-- Loading Overlay -->
  <div id="loadingOverlay" class="hidden fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-300">
    <div class="bg-white rounded-2xl p-8 flex flex-col items-center shadow-2xl transform scale-100">
      <div class="relative w-16 h-16 mb-4">
        <div class="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
        <div class="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
        <i class="fas fa-shield-alt absolute inset-0 m-auto text-indigo-600 text-xl flex items-center justify-center"></i>
      </div>
      <h3 class="text-lg font-bold text-gray-900">認証中...</h3>
      <p class="text-sm text-gray-500 mt-1">セキュリティチェックを行っています</p>
    </div>
  </div>

  <script type="module" src="/static/auth/login.js"></script>
</body>
</html>
      `)
})

// Redirect to Firebase login page
auth.get('/', (c) => {
  return c.redirect('/firebase-login')
})

// Legacy login page (for reference)
auth.get('/legacy-login', (c) => {
  return c.render(
    <Layout active="login">
      <div class="flex min-h-screen">
        {/* Left Side: Login Form */}
        <div class="w-full lg:w-1/2 p-12 flex flex-col justify-center bg-white">
          <div class="max-w-md mx-auto w-full">
            <div class="flex items-center mb-8">
              <div class="bg-blue-600 text-white p-1.5 rounded-md mr-2">
                <i class="fas fa-chart-simple"></i>
              </div>
              <span class="font-bold text-xl text-gray-900">SmartMeasure</span>
            </div>
            
            <h2 class="text-3xl font-bold mb-2 text-gray-900">ログイン</h2>
            <p class="text-gray-500 mb-8">採寸データにアクセスするには情報を入力してください。</p>
            
            <form action="/login" method="post" class="space-y-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  <i class="fas fa-building text-blue-600 mr-1"></i>
                  企業ID
                </label>
                <input 
                  type="text" 
                  name="company_id" 
                  value="test_company" 
                  placeholder="例: test_company, ABC_company"
                  class="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                  required
                />
                <p class="text-xs text-gray-500 mt-1">
                  <i class="fas fa-info-circle mr-1"></i>
                  企業ごとにデータが分離されます（Phase 1: デモ用）
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input type="email" name="email" value="user@example.com" class="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              
              <div>
                <div class="flex justify-between mb-1">
                  <label class="block text-sm font-medium text-gray-700">パスワード</label>
                  <a href="#" class="text-sm text-blue-600 hover:underline">お忘れですか？</a>
                </div>
                <div class="relative">
                  <input type="password" name="password" value="password" class="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  <i class="fas fa-eye text-gray-400 absolute right-4 top-3.5 cursor-pointer"></i>
                </div>
              </div>
              
              <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-md shadow-blue-200">
                ログイン
              </button>
            </form>
            
            <div class="relative my-8">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-gray-200"></div>
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="px-2 bg-white text-gray-500">または</span>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <button class="flex items-center justify-center py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <i class="fab fa-google text-red-500 mr-2"></i>
                <span class="text-sm font-medium text-gray-700">Google</span>
              </button>
              <button class="flex items-center justify-center py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <i class="fab fa-microsoft text-blue-500 mr-2"></i>
                <span class="text-sm font-medium text-gray-700">Microsoft</span>
              </button>
            </div>
            
            <div class="mt-8 text-center text-sm">
              <span class="text-gray-500">アカウントをお持ちでないですか？</span>
              <a href="#" class="text-blue-600 font-bold ml-1 hover:underline">新規登録</a>
            </div>
            
            <div class="mt-8 flex justify-center space-x-6 text-xs text-gray-400">
              <a href="#">プライバシーポリシー</a>
              <a href="#">利用規約</a>
            </div>
          </div>
        </div>
        
        {/* Right Side: Hero Image */}
        <div class="hidden lg:block w-1/2 bg-gray-900 relative overflow-hidden">
          <img src="https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?q=80&w=2070&auto=format&fit=crop" alt="Background" class="absolute inset-0 w-full h-full object-cover opacity-60" />
          <div class="absolute bottom-0 left-0 p-12 text-white bg-gradient-to-t from-black/80 to-transparent w-full">
            <span class="inline-block px-3 py-1 bg-gray-700/50 rounded-full text-xs mb-4 backdrop-blur-sm">● システム稼働中</span>
            <h1 class="text-4xl font-bold mb-4 leading-tight">高精度な採寸。<br/>シームレスな連携。</h1>
            <p class="text-gray-300">採寸画像の自動処理、背景白抜き、ECサイトへのCSVデータ連携をスムーズに行います。</p>
            <div class="flex space-x-4 mt-8">
              <div class="flex items-center bg-gray-800/80 backdrop-blur px-4 py-2 rounded-lg">
                <i class="fas fa-camera mr-2"></i> スマート撮影
              </div>
              <div class="flex items-center bg-gray-800/80 backdrop-blur px-4 py-2 rounded-lg">
                <i class="fas fa-magic mr-2"></i> AI背景白抜き
              </div>
              <div class="flex items-center bg-gray-800/80 backdrop-blur px-4 py-2 rounded-lg">
                <i class="fas fa-table mr-2"></i> CSV出力
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
})

auth.post('/login', async (c) => {
  // Get form data
  const formData = await c.req.formData();
  const companyId = formData.get('company_id') || 'test_company';
  const email = formData.get('email');
  
  logger.debug(`🔐 Login attempt: company_id=${companyId}, email=${email}`);
  
  // Phase 1: Store company_id in cookie (no real authentication)
  // Phase 2: Will use Firebase Auth with custom claims
  
  // Set cookie with company_id (expires in 30 days)
  c.header('Set-Cookie', `company_id=${companyId}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`);
  
  logger.debug(`✅ Login successful: company_id=${companyId}`);
  
  return c.redirect('/dashboard')
})

export default auth
