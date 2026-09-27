<template>
  <div class="page">
    <header class="topbar">
      <div>
        <div class="brand">规则管理</div>
        <div class="muted small">策略组 + 规则集模式：策略组决定流量走向，规则集决定哪些流量命中</div>
      </div>
      <n-space align="center">
        <n-button size="small" @click="router.push('/')">返回订阅</n-button>
        <n-button size="small" @click="exportConfig">导出配置</n-button>
        <n-button size="small" @click="pickFile">导入配置</n-button>
        <n-tag round :bordered="false" type="info">{{ session.username || '已登录' }}</n-tag>
        <n-button size="small" @click="logout">退出</n-button>
      </n-space>
    </header>
    <n-tabs v-model:value="tab" type="line" animated>
      <n-tab-pane name="groups" :tab="'策略组（' + groups.length + '）'">
        <div class="toolbar">
          <n-space>
            <n-button type="primary" @click="openGroupCreate">新建策略组</n-button>
            <n-popconfirm @positive-click="resetGroups">
              <template #trigger>
                <n-button>恢复默认策略组</n-button>
              </template>
              会补齐缺失的默认策略组（不会删除你自建的），继续吗？
            </n-popconfirm>
            <n-button :loading="loading" @click="loadAll">刷新</n-button>
          </n-space>
          <span class="muted small">策略组名称会被规则集引用</span>
        </div>
        <n-spin :show="loading">
          <n-empty v-if="!groups.length && !loading" description="还没有策略组，先新建或恢复默认" style="padding: 60px 0" />
          <n-grid :cols="'1 s:2 m:3'" responsive="screen" :x-gap="14" :y-gap="14">
            <n-grid-item v-for="item in groups" :key="item.id">
              <n-card size="small" class="sub-card">
                <template #header>
                  <div class="card-title">
                    <span class="ellipsis" :title="item.name">{{ item.name }}</span>
                    <n-switch size="small" :value="item.enabled !== false" @update:value="(value) => toggleGroup(item, value)" />
                  </div>
                </template>
                <template #header-extra>
                  <n-tag size="small" :bordered="false" type="warning">{{ item.type }}</n-tag>
                </template>
                <div class="meta">
                  <div>成员：{{ describeMembers(item) }}</div>
                  <div v-if="item.type !== 'select'" class="muted small">
                    测速：{{ item.url }} · 每 {{ item.interval }}s · 容差 {{ item.tolerance }}ms
                  </div>
                </div>
                <template #action>
                  <n-space :size="6">
                    <n-button size="tiny" @click="openGroupEdit(item)">编辑</n-button>
                    <n-popconfirm @positive-click="removeGroup(item)">
                      <template #trigger>
                        <n-button size="tiny" type="error" ghost>删除</n-button>
                      </template>
                      确认删除「{{ item.name }}」？引用它的规则集会失去目标。
                    </n-popconfirm>
                  </n-space>
                </template>
              </n-card>
            </n-grid-item>
          </n-grid>
        </n-spin>
      </n-tab-pane>
      <n-tab-pane name="rules" :tab="'规则集（' + items.length + '）'">
        <div class="toolbar">
          <n-space>
            <n-button type="primary" @click="openCreate">新建规则集</n-button>
            <n-dropdown trigger="click" :options="importOptions" @select="importPreset">
              <n-button>导入预设规则集</n-button>
            </n-dropdown>
            <n-button :loading="loading" @click="loadAll">刷新</n-button>
          </n-space>
          <span class="muted small">规则集需要指定目标策略组</span>
        </div>
        <n-spin :show="loading">
          <n-empty v-if="!items.length && !loading" description="还没有规则集，可以新建或从预设导入" style="padding: 60px 0" />
          <n-grid :cols="'1 s:2 m:3'" responsive="screen" :x-gap="14" :y-gap="14">
            <n-grid-item v-for="item in items" :key="item.id">
              <n-card size="small" class="sub-card">
                <template #header>
                  <div class="card-title">
                    <span class="ellipsis" :title="item.name">{{ item.name }}</span>
                    <n-switch size="small" :value="item.enabled !== false" @update:value="(value) => toggleEnabled(item, value)" />
                  </div>
                </template>
                <template #header-extra>
                  <n-tag size="small" :bordered="false" :type="item.type === 'url' ? 'info' : 'success'">
                    {{ item.type === 'url' ? '链接规则' : '手写规则' }}
                  </n-tag>
                </template>
                <div class="meta">
                  <div>
                    目标策略组：
                    <span class="mono">{{ item.group }}</span>
                    <n-tag v-if="!knownTargets.includes(item.group)" size="tiny" type="error" :bordered="false" style="margin-left: 6px">
                      策略组不存在
                    </n-tag>
                    <n-tag v-else-if="SPECIAL_PROXIES.includes(item.group)" size="tiny" :bordered="false" style="margin-left: 6px">
                      内置策略
                    </n-tag>
                  </div>
                  <div v-if="item.type === 'url'">behavior：{{ item.behavior }} · 每 {{ Math.round((item.interval || 86400) / 3600) }} 小时更新</div>
                  <div v-else>规则条数：{{ countLines(item.content) }}</div>
                  <div class="muted small ellipsis" :title="item.url || item.description">{{ item.url || item.description || '—' }}</div>
                </div>
                <template #action>
                  <n-space :size="6">
                    <n-button size="tiny" @click="openEdit(item)">编辑</n-button>
                    <n-popconfirm @positive-click="remove(item)">
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
      </n-tab-pane>
    </n-tabs>
    <RuleSetModal v-model:show="modalVisible" :model="editing" :group-options="groupOptions" @saved="loadAll" />
    <ProxyGroupModal
      v-model:show="groupModalVisible"
      :model="editingGroup"
      :group-names="groupNames"
      @saved="loadAll"
    />
    <input ref="fileInput" type="file" accept=".json,application/json" style="display: none" @change="onFileChange" />
    <n-modal v-model:show="importVisible" preset="card" title="导入配置" :style="{ width: '560px', maxWidth: '96vw' }">
      <p class="muted small" style="margin-top: 0">{{ importSummary }}</p>
      <n-radio-group v-model:value="importMode" style="margin-bottom: 12px">
        <n-space vertical :size="6">
          <n-radio value="skip">跳过同名项（推荐，保留现有配置）</n-radio>
          <n-radio value="overwrite">覆盖同名项（用文件里的内容替换）</n-radio>
        </n-space>
      </n-radio-group>
      <p class="muted small" style="margin: 0">
        只导入策略组与规则集；订阅与分享令牌不会被导入或覆盖。规则集引用的策略组名称若不存在，会自动回退到默认策略组。
      </p>
      <template #footer>
        <n-space justify="end">
          <n-button @click="importVisible = false">取消</n-button>
          <n-button type="primary" :loading="importing" @click="confirmImport">开始导入</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NDropdown,
  NEmpty,
  NGrid,
  NGridItem,
  NModal,
  NPopconfirm,
  NRadio,
  NRadioGroup,
  NSpace,
  NSpin,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useMessage
} from 'naive-ui';
import { NODES_PLACEHOLDER, SPECIAL_PROXIES } from '@shared/clash-config.js';
import RuleSetModal from '../components/RuleSetModal.vue';
import ProxyGroupModal from '../components/ProxyGroupModal.vue';
import { api } from '../api.js';
import { doLogout, session } from '../session.js';
const router = useRouter();
const message = useMessage();
const tab = ref('groups');
const groups = ref([]);
const items = ref([]);
const loading = ref(false);
const modalVisible = ref(false);
const editing = ref(null);
const groupModalVisible = ref(false);
const editingGroup = ref(null);
const importOptions = [
  { label: '基础分流（内置规则）', key: 'basic' },
  { label: 'Loyalsoldier/clash-rules', key: 'loyalsoldier' },
  { label: 'blackmatrix7/ios_rule_script', key: 'blackmatrix7' }
];
const groupNames = computed(() => groups.value.map((item) => item.name));
// 内置策略（DIRECT/REJECT/PASS）始终存在，不参与"策略组不存在"的判断
const knownTargets = computed(() => groupNames.value.concat(SPECIAL_PROXIES));
const groupOptions = computed(() => {
  const options = [];
  for (const item of groups.value) options.push({ label: item.name + '（策略组）', value: item.name });
  for (const name of SPECIAL_PROXIES) options.push({ label: name, value: name });
  return options;
});
function countLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')).length;
}
function describeMembers(item) {
  const members = Array.isArray(item.members) ? item.members : [];
  const shown = members.map((name) => (name === NODES_PLACEHOLDER ? '全部节点' : name));
  return shown.length ? shown.join(' · ') : '（空）';
}
async function loadAll() {
  loading.value = true;
  try {
    const [groupData, ruleData] = await Promise.all([api.proxyGroups(), api.ruleSets()]);
    groups.value = (groupData && groupData.items) || [];
    items.value = (ruleData && ruleData.items) || [];
  } catch (err) {
    if (err && err.status === 401) {
      session.authenticated = false;
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
  modalVisible.value = true;
}
function openEdit(item) {
  editing.value = item;
  modalVisible.value = true;
}
function openGroupCreate() {
  editingGroup.value = null;
  groupModalVisible.value = true;
}
function openGroupEdit(item) {
  editingGroup.value = item;
  groupModalVisible.value = true;
}
async function toggleEnabled(item, value) {
  try {
    await api.updateRuleSet(item.id, Object.assign({}, item, { enabled: value }));
    await loadAll();
  } catch (err) {
    message.error((err && err.message) || '操作失败');
  }
}
async function toggleGroup(item, value) {
  try {
    await api.updateProxyGroup(item.id, Object.assign({}, item, { enabled: value }));
    await loadAll();
  } catch (err) {
    message.error((err && err.message) || '操作失败');
  }
}
async function remove(item) {
  try {
    await api.removeRuleSet(item.id);
    message.success('已删除');
    await loadAll();
  } catch (err) {
    message.error((err && err.message) || '删除失败');
  }
}
async function removeGroup(item) {
  try {
    await api.removeProxyGroup(item.id);
    message.success('已删除');
    await loadAll();
  } catch (err) {
    message.error((err && err.message) || '删除失败');
  }
}
async function resetGroups() {
  try {
    const data = await api.resetProxyGroups();
    groups.value = (data && data.items) || [];
    message.success('已补齐默认策略组');
  } catch (err) {
    message.error((err && err.message) || '操作失败');
  }
}
async function importPreset(key) {
  try {
    const data = await api.importRulePreset(key);
    message.success('已导入 ' + ((data && data.items && data.items.length) || 0) + ' 个规则集');
    tab.value = 'rules';
    await loadAll();
  } catch (err) {
    message.error((err && err.message) || '导入失败');
  }
}
const fileInput = ref(null);
const importVisible = ref(false);
const importMode = ref('skip');
const importSummary = ref('');
const importing = ref(false);
const pendingPayload = ref(null);
async function exportConfig() {
  try {
    const data = await api.exportConfig();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'clash-config-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    message.success(
      '已导出 ' + ((data.proxyGroups || []).length) + ' 个策略组、' + ((data.ruleSets || []).length) + ' 个规则集'
    );
  } catch (err) {
    message.error((err && err.message) || '导出失败');
  }
}
function pickFile() {
  if (fileInput.value) fileInput.value.click();
}
async function onFileChange(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    pendingPayload.value = parsed;
    importSummary.value =
      '文件：' + file.name + '；包含 ' + ((parsed.proxyGroups || []).length) + ' 个策略组、' + ((parsed.ruleSets || []).length) + ' 个规则集';
    importMode.value = 'skip';
    importVisible.value = true;
  } catch (err) {
    message.error('文件不是合法的 JSON');
  }
}
async function confirmImport() {
  if (!pendingPayload.value) return;
  importing.value = true;
  try {
    const result = await api.importConfig({ mode: importMode.value, data: pendingPayload.value });
    importVisible.value = false;
    pendingPayload.value = null;
    message.success(
      '导入完成：新建 ' + result.created + '，更新 ' + result.updated + '，跳过 ' + result.skipped + '，忽略 ' + result.invalid
    );
    await loadAll();
  } catch (err) {
    message.error((err && err.message) || '导入失败');
  } finally {
    importing.value = false;
  }
}
async function logout() {
  await doLogout();
  router.replace({ name: 'login' });
}
onMounted(loadAll);
</script>
