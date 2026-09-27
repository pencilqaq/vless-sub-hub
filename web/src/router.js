import { createRouter, createWebHistory } from 'vue-router';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import RulesView from './views/RulesView.vue';
import { refreshSession, session } from './session.js';
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
