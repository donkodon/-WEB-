import { html } from 'hono/html'
import { jsx } from 'hono/jsx'

export const Sidebar = ({ active }: { active: string }) => (
  <aside class="w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 flex flex-col z-10">
    <div class="p-4 border-b border-gray-100 flex items-center space-x-2">
      <div class="bg-blue-600 text-white p-1 rounded-md">
        <i class="fas fa-image"></i>
      </div>
      <span class="font-bold text-lg text-gray-800">EC Photo Studio</span>
    </div>
    
    <nav class="flex-1 overflow-y-auto py-4">
      <ul class="space-y-1 px-2">
        <li>
          <a href="/dashboard" class={`flex items-center px-4 py-2.5 rounded-lg transition-colors ${active === 'dashboard' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <i class="fas fa-th-large w-6 text-center"></i>
            <span class="ml-2">ダッシュボード</span>
          </a>
        </li>
        <li>
          <a href="#" class="flex items-center px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <i class="fas fa-images w-6 text-center"></i>
            <span class="ml-2">商品画像一覧</span>
          </a>
        </li>
        <li>
          <a href="/settings" class={`flex items-center px-4 py-2.5 rounded-lg transition-colors ${active === 'settings' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <i class="fas fa-cog w-6 text-center"></i>
            <span class="ml-2">設定</span>
          </a>
        </li>
      </ul>
    </nav>

    <div class="p-4 border-t border-gray-200">
      <div class="flex items-center p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
        <div class="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-orange-600 font-bold">
          K
        </div>
        <div class="ml-3">
          <p class="text-sm font-medium text-gray-700">Kenji</p>
          <p class="text-xs text-gray-500">Manager</p>
        </div>
      </div>
    </div>
  </aside>
);

export const Layout = (props: { children: any; active?: string; title?: string }) => {
  if (props.active === 'login') {
    return <main class="min-h-screen bg-white">{props.children}</main>;
  }

  return (
    <div class="flex min-h-screen bg-gray-50">
      <Sidebar active={props.active || ''} />
      <main class="flex-1 ml-64 p-8">
        <header class="flex justify-between items-center mb-8">
          <h1 class="text-2xl font-bold text-gray-800">{props.title}</h1>
          <div class="flex items-center space-x-4">
            <button class="text-gray-400 hover:text-gray-600">
              <i class="fas fa-bell text-xl"></i>
            </button>
            <div class="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-orange-600 font-bold">
              K
            </div>
          </div>
        </header>
        {props.children}
      </main>
    </div>
  );
};
