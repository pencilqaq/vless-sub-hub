<template>
  <div class="login-wrap">
    <n-card class="login-card" :bordered="false">
      <div class="login-head">
        <h1>VLESS 订阅中心</h1>
        <p class="muted">请登录后管理你的订阅</p>
      </div>
      <n-form :model="form" :show-label="false" @submit.prevent>
        <n-form-item>
          <n-input
            v-model:value="form.username"
            size="large"
            placeholder="用户名"
            :input-props="{ autocomplete: 'username' }"
            @keydown.enter.prevent="submit"
          />
        </n-form-item>
        <n-form-item>
          <n-input
            v-model:value="form.password"
            size="large"
            type="password"
            show-password-on="click"
            placeholder="密码"
            :input-props="{ autocomplete: 'current-password' }"
            @keydown.enter.prevent="submit"
          />
        </n-form-item>
        <n-alert v-if="error" type="error" :show-icon="false" style="margin-bottom: 14px">{{ error }}</n-alert>
        <n-button type="primary" size="large" block :loading="loading" @click="submit">登录</n-button>
      </n-form>
      <p class="muted small" style="margin: 14px 0 0">
        账号与密码由服务端 <span class="mono">.env</span> 配置，推荐使用 scrypt 哈希而非明文。
      </p>
    </n-card>
  </div>
</template>
<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NAlert, NButton, NCard, NForm, NFormItem, NInput } from 'naive-ui';
import { api } from '../api.js';
import { session } from '../session.js';
const form = reactive({ username: '', password: '' });
const error = ref('');
const loading = ref(false);
const router = useRouter();
const route = useRoute();
async function submit() {
  if (loading.value) return;
  error.value = '';
  if (!form.username || !form.password) {
    error.value = '请填写用户名与密码';
    return;
  }
  loading.value = true;
  try {
    const data = await api.login(form.username, form.password);
    session.authenticated = true;
    session.username = (data && data.username) || form.username;
    const target = typeof route.query.redirect === 'string' && route.query.redirect ? route.query.redirect : '/';
    router.replace(target);
  } catch (err) {
    error.value = (err && err.message) || '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>
