<template>
  <n-modal
    :show="show"
    preset="card"
    title="分享订阅"
    :style="{ width: '760px', maxWidth: '96vw' }"
    @update:show="(value) => emit('update:show', value)"
  >
    <div v-if="item" class="share-body">
      <div class="share-left">
        <div class="field-label">订阅格式</div>
        <n-select v-model:value="format" :options="formatOptions" style="margin-bottom: 14px" />
        <div class="field-label">订阅地址</div>
        <n-input :value="shareUrl" readonly type="textarea" :rows="3" style="margin-bottom: 12px" />
        <n-space>
          <n-button type="primary" @click="copy">复制地址</n-button>
          <n-button :loading="exporting" @click="copyContent">复制内容</n-button>
          <n-button :loading="exporting" @click="download">下载文件</n-button>
          <n-popconfirm @positive-click="rotate">
            <template #trigger>
              <n-button type="warning" ghost>重置地址</n-button>
            </template>
            重置后旧地址立即失效，确定吗？
          </n-popconfirm>
        </n-space>
        <div class="muted small" style="margin-top: 14px">
          被拉取 {{ item.hits }} 次<span v-if="item.lastAccessAt">，最近一次 {{ formatTime(item.lastAccessAt) }}</span>
        </div>
        <div class="muted small" style="margin-top: 6px">
          客户端按 User-Agent 自动识别格式：Clash 内核返回 YAML（若订阅开启了"完整配置"，这里就是含策略组与分流规则的完整 config），sing-box 返回 JSON，其它客户端返回 Base64 订阅。
        </div>
      </div>
      <div class="share-right">
        <div class="qr-box">
          <img v-if="qr" :src="qr" alt="订阅二维码" width="220" height="220" />
          <span v-else class="muted small">二维码生成中…</span>
        </div>
        <div class="muted small" style="text-align: center; margin-top: 8px">手机客户端扫码导入</div>
      </div>
    </div>
    <n-alert v-else type="warning" :show-icon="false">请先在列表中选择一个订阅</n-alert>
  </n-modal>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { NAlert, NButton, NInput, NModal, NPopconfirm, NSelect, NSpace, useMessage } from 'naive-ui';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { copyText } from '../clipboard.js';
const props = defineProps({
  show: { type: Boolean, default: false },
  item: { type: Object, default: null }
});
const emit = defineEmits(['update:show', 'changed']);
const message = useMessage();
const format = ref('base64');
const qr = ref('');
const localUrl = ref('');
const exporting = ref(false);
const formatOptions = [
  { label: 'Base64 通用订阅（推荐）', value: 'base64' },
  { label: '明文链接列表', value: 'links' },
  { label: 'Clash / mihomo YAML', value: 'clash' },
  { label: 'sing-box outbounds JSON', value: 'singbox' }
];
const shareUrl = computed(() => {
  if (!localUrl.value) return '';
  if (format.value === 'base64') return localUrl.value;
  return localUrl.value + '?format=' + format.value;
});
watch(
  [() => props.show, () => props.item, format],
  async () => {
    localUrl.value = props.item && props.item.shareUrl ? props.item.shareUrl : '';
    if (!props.show || !shareUrl.value) {
      qr.value = '';
      return;
    }
    try {
      qr.value = await QRCode.toDataURL(shareUrl.value, { width: 240, margin: 1 });
    } catch (err) {
      qr.value = '';
    }
  },
  { immediate: true }
);
function formatTime(value) {
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return value;
  }
}
async function copy() {
  const ok = await copyText(shareUrl.value);
  message[ok ? 'success' : 'error'](ok ? '订阅地址已复制' : '复制失败，请手动复制');
}
async function copyContent() {
  if (!props.item) return;
  exporting.value = true;
  try {
    const text = await api.exportText(props.item.id, format.value);
    const ok = await copyText(text);
    message[ok ? 'success' : 'error'](ok ? '订阅内容已复制' : '复制失败');
  } catch (err) {
    message.error((err && err.message) || '获取内容失败');
  } finally {
    exporting.value = false;
  }
}
async function download() {
  if (!props.item) return;
  exporting.value = true;
  try {
    const text = await api.exportText(props.item.id, format.value);
    const ext = format.value === 'clash' ? 'yaml' : format.value === 'singbox' ? 'json' : 'txt';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = (props.item.name || 'subscription') + '.' + ext;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    message.error((err && err.message) || '导出失败');
  } finally {
    exporting.value = false;
  }
}
async function rotate() {
  if (!props.item) return;
  try {
    const updated = await api.rotate(props.item.id);
    localUrl.value = (updated && updated.shareUrl) || '';
    emit('changed');
    message.success('分享地址已重置，旧地址已失效');
  } catch (err) {
    message.error((err && err.message) || '重置失败');
  }
}
</script>
