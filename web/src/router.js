import { createRouter, createWebHistory } from 'vue-router';
import { refreshSession, session } from './session.js';
// 路由级懒加载：登录页先加载，控制台与规则管理按需下载各自的 chunk
const LoginView = () => import('./views/LoginView.vue');
const DashboardView = () => import('./views/DashboardView.vue');
const RulesView = () => import('./views/RulesView.vue');
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
    { path: '/rules', name: 'rules', component: RulesView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});
router.beforeEach(async (to) => {
  if (!session.ready) await refreshSession();
  if (to.meta.requiresAuth && !session.authenticated) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
  }
  if (to.name === 'login' && session.authenticated) {
    return { name: 'dashboard' };
  }
  return true;
});
