<template>
  <div class="page">
    <header class="topbar">
      <div>
        <div class="brand">VLESS 订阅中心</div>
        <div class="muted small">多优选 IP 订阅生成与分享</div>
      </div>
      <n-space align="center">
        <n-tag round :bordered="false" type="info">{{ session.username || '已登录' }}</n-tag>
        <n-button size="small" @click="router.push('/rules')">规则管理</n-button>
        <n-button size="small" @click="logout">退出</n-button>
      </n-space>
    </header>
    <div class="toolbar">
      <n-space>
        <n-button type="primary" @click="openCreate">新建订阅</n-button>
        <n-button :loading="loading" @click="load">刷新</n-button>
      </n-space>
      <span class="muted small">共 {{ items.length }} 个订阅</span>
    </div>
    <n-spin :show="loading">
      <n-empty
        v-if="!items.length && !loading"
        description="还没有订阅，点击「新建订阅」开始"
        style="padding: 70px 0"
      />
      <n-grid :cols="'1 s:2 m:3'" responsive="screen" :x-gap="14" :y-gap="14">
        <n-grid-item v-for="item in items" :key="item.id">
          <n-card size="small" class="sub-card">
            <template #header>
              <div class="card-title">
                <span class="ellipsis" :title="item.name">{{ item.name }}</span>
                <n-switch
                  size="small"
                  :value="item.enabled"
                  @update:value="(value) => toggleEnabled(item, value)"
                />
              </div>
            </template>
            <template #header-extra>
              <n-tag size="small" :bordered="false" :type="item.error ? 'error' : 'success'">
                {{ item.error ? '配置有误' : item.linkCount + ' 个节点' }}
              </n-tag>
            </template>
            <div class="meta">
              <div>源域名：<span class="mono">{{ item.baseHost || '—' }}</span></div>
              <div>IP 条目：{{ item.ipCount }} · 被拉取 {{ item.hits }} 次</div>
              <div class="muted small ellipsis" :title="item.shareUrl">{{ item.shareUrl }}</div>
            </div>
            <n-alert
              v-if="item.error"
              type="error"
              :show-icon="false"
              style="margin-top: 10px"
            >
              {{ item.error }}
            </n-alert>
            <n-alert
              v-else-if="item.warnings && item.warnings.length"
              type="warning"
              :show-icon="false"
              style="margin-top: 10px"
            >
              {{ item.warnings[0] }}
            </n-alert>
            <template #action>
              <n-space :size="6">
                <n-button size="tiny" @click="openEdit(item)">编辑</n-button>
                <n-button size="tiny" type="primary" ghost @click="openShare(item)">分享</n-button>
                <n-button size="tiny" @click="copyShare(item)">复制地址</n-button>
                <n-popconfirm @positive-click="removeItem(item)">
                  <template #trigger>
                    <n-button size="tiny" type="error" ghost>删除</n-button>
                  </template>
                  确认删除「{{ item.name }}」？
                </n-popconfirm>
              </n-space>
            </template>
          </n-card>
        </n-grid-item>
      </n-grid>
    </n-spin>
    <SubscriptionEditModal v-if="editVisible" v-model:show="editVisible" :model="editing" @saved="load" />
    <ShareModal v-if="shareVisible" v-model:show="shareVisible" :item="sharing" @changed="load" />
  </div>
</template>
<script setup>
import { defineAsyncComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NGrid,
  NGridItem,
  NPopconfirm,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  useMessage
} from 'naive-ui';
const SubscriptionEditModal = defineAsyncComponent(() => import('../components/SubscriptionEditModal.vue'));
const ShareModal = defineAsyncComponent(() => import('../components/ShareModal.vue'));
import { api } from '../api.js';
import { doLogout, session } from '../session.js';
import { copyText } from '../clipboard.js';
const items = ref([]);
const loading = ref(false);
const editVisible = ref(false);
const editing = ref(null);
const shareVisible = ref(false);
const sharing = ref(null);
const router = useRouter();
const message = useMessage();
async function load() {
  loading.value = true;
  try {
    const data = await api.list();
    items.value = (data && data.items) || [];
    if (sharing.value) {
      const fresh = items.value.find((entry) => entry.id === sharing.value.id);
      if (fresh) sharing.value = fresh;
    }
  } catch (err) {
    if (err && err.status === 401) {
      session.authenticated = false;
      message.warning('登录已过期，请重新登录');
      router.replace({ name: 'login' });
      return;
    }
    message.error((err && err.message) || '加载失败');
  } finally {
    loading.value = false;
  }
}
function openCreate() {
  editing.value = null;
  editVisible.value = true;
}
function openEdit(item) {
  editing.value = item;
  editVisible.value = true;
}
function openShare(item) {
  sharing.value = item;
  shareVisible.value = true;
}
async function copyShare(item) {
  const ok = await copyText(item.shareUrl);
  message[ok ? 'success' : 'error'](ok ? '订阅地址已复制' : '复制失败，请手动复制');
}
async function toggleEnabled(item, value) {
  try {
    const updated = await api.update(item.id, Object.assign({}, item, { enabled: value }));
    const index = items.value.findIndex((entry) => entry.id === item.id);
    if (index >= 0) items.value[index] = updated;
    message.success(value ? '已启用分享' : '已停用分享');
  } catch (err) {
    message.error((err && err.message) || '操作失败');
  }
}
async function removeItem(item) {
  try {
    await api.remove(item.id);
    message.success('已删除');
    await load();
  } catch (err) {
    message.error((err && err.message) || '删除失败');
  }
}
async function logout() {
  await doLogout();
  router.replace({ name: 'login' });
}
onMounted(load);
</script>
