import { reactive } from 'vue';
import { api } from './api.js';
export const session = reactive({
  ready: false,
  authenticated: false,
  username: ''
});
export async function refreshSession() {
  try {
    const data = await api.session();
    session.authenticated = !!(data && data.authenticated);
    session.username = (data && data.username) || '';
  } catch (err) {
    session.authenticated = false;
    session.username = '';
  } finally {
    session.ready = true;
  }
  return session.authenticated;
}
export async function doLogout() {
  try {
    await api.logout();
  } catch (err) {
    /* 忽略网络错误，本地状态照常清理 */
  }
  session.authenticated = false;
  session.username = '';
}
