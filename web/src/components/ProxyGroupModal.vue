<template>
  <n-modal
    :show="show"
    preset="card"
    :title="model && model.id ? '编辑策略组' : '新建策略组'"
    :style="{ width: '720px', maxWidth: '96vw' }"
    :mask-closable="false"
    @update:show="(value) => emit('update:show', value)"
  >
    <n-form label-placement="top" :model="form">
      <div class="two-col">
        <n-form-item label="策略组名称（规则集会引用它）">
          <n-input v-model:value="form.name" placeholder="例如：🎮 游戏" maxlength="40" />
        </n-form-item>
        <n-form-item label="类型">
          <n-select v-model:value="form.type" :options="typeOptions" />
        </n-form-item>
      </div>
      <template v-if="form.type !== 'select'">
        <div class="two-col">
          <n-form-item label="测速地址">
            <n-input v-model:value="form.url" placeholder="https://www.gstatic.com/generate_204" />
          </n-form-item>
          <n-form-item label="测速间隔（秒）">
            <n-input v-model:value="form.interval" placeholder="300" />
          </n-form-item>
        </div>
        <n-form-item label="容差（毫秒，仅 url-test / fallback）">
          <n-input v-model:value="form.tolerance" style="max-width: 160px" placeholder="50" />
        </n-form-item>
      </template>
      <n-form-item label="成员（可多选，顺序即列表顺序）">
        <n-select v-model:value="form.members" multiple :options="memberOptions" placeholder="至少选择一个" />
      </n-form-item>
      <p class="muted small" style="margin: -6px 0 10px">
        「全部节点」会在生成时展开成该订阅的所有节点；也可以引用其它策略组（如 ♻️ 自动选择）、DIRECT、REJECT。
      </p>
      <n-checkbox v-model:checked="form.enabled">启用（停用后订阅里不再包含它）</n-checkbox>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" :loading="saving" @click="save">保存</n-button>
      </n-space>
    </template>
  </n-modal>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { NButton, NCheckbox, NForm, NFormItem, NInput, NModal, NSelect, NSpace, useMessage } from 'naive-ui';
import { NODES_PLACEHOLDER, SPECIAL_PROXIES } from '@shared/clash-config.js';
import { api } from '../api.js';
const props = defineProps({
  show: { type: Boolean, default: false },
  model: { type: Object, default: null },
  groupNames: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:show', 'saved']);
const message = useMessage();
const saving = ref(false);
const typeOptions = [
  { label: 'select（手动选择）', value: 'select' },
  { label: 'url-test（自动测速选择最快）', value: 'url-test' },
  { label: 'fallback（故障转移）', value: 'fallback' },
  { label: 'load-balance（负载均衡）', value: 'load-balance' }
];
function blank() {
  return {
    name: '',
    type: 'select',
    url: 'https://www.gstatic.com/generate_204',
    interval: '300',
    tolerance: '50',
    members: [NODES_PLACEHOLDER],
    enabled: true
  };
}
const form = reactive(blank());
const memberOptions = computed(() => {
  const options = [{ label: '全部节点（订阅里的所有节点）', value: NODES_PLACEHOLDER }];
  for (const name of props.groupNames) {
    if (name !== form.name) options.push({ label: name + '（策略组）', value: name });
  }
  for (const name of SPECIAL_PROXIES) options.push({ label: name, value: name });
  return options;
});
watch(
  () => props.show,
  (visible) => {
    if (!visible) return;
    const source = props.model || {};
    Object.assign(form, blank(), {
      name: source.name || '',
      type: source.type || 'select',
      url: source.url || 'https://www.gstatic.com/generate_204',
      interval: String(source.interval || '300'),
      tolerance: String(source.tolerance == null ? '50' : source.tolerance),
      members: Array.isArray(source.members) && source.members.length ? source.members.slice() : [NODES_PLACEHOLDER],
      enabled: source.enabled !== false
    });
  }
);
async function save() {
  if (!form.name.trim()) {
    message.error('请填写策略组名称');
    return;
  }
  const reserved = SPECIAL_PROXIES.some((name) => name.toLowerCase() === form.name.trim().toLowerCase());
  if (reserved) {
    message.error('DIRECT / REJECT / PASS 是内置策略，不能用作策略组名称');
    return;
  }
  if (!form.members.length) {
    message.error('请至少选择一个成员');
    return;
  }
  saving.value = true;
  try {
    const payload = Object.assign({}, form);
    if (props.model && props.model.id) await api.updateProxyGroup(props.model.id, payload);
    else await api.createProxyGroup(payload);
    message.success('已保存');
    emit('saved');
    emit('update:show', false);
  } catch (err) {
    message.error((err && err.message) || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>
