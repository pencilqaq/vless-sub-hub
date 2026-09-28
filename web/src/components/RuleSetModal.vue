<template>
  <n-modal
    :show="show"
    preset="card"
    :title="model && model.id ? '编辑规则集' : '新建规则集'"
    :style="{ width: '880px', maxWidth: '96vw' }"
    :mask-closable="false"
    @update:show="(value) => emit('update:show', value)"
  >
    <n-form label-placement="top" :model="form">
      <div class="two-col">
        <n-form-item label="名称">
          <n-input v-model:value="form.name" placeholder="例如：我的直连规则" maxlength="60" />
        </n-form-item>
        <n-form-item :label="targetGroupLabel">
          <n-select v-model:value="form.group" :options="groupOptions" placeholder="请先在策略组标签页创建" />
        </n-form-item>
      </div>
      <n-form-item label="规则来源">
        <n-radio-group v-model:value="form.type">
          <n-space>
            <n-radio value="url">远程链接（rule-provider）</n-radio>
            <n-radio value="inline">自己创建（直接写规则）</n-radio>
          </n-space>
        </n-radio-group>
      </n-form-item>
      <template v-if="form.type === 'url'">
        <n-form-item label="规则文件链接">
          <n-input
            v-model:value="form.url"
            placeholder="https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Advertising/Advertising.yaml"
          />
        </n-form-item>
        <div class="two-col">
          <n-form-item label="文件格式（behavior）">
            <n-select v-model:value="form.behavior" :options="behaviorOptions" />
          </n-form-item>
          <n-form-item label="更新间隔（秒）">
            <n-input v-model:value="form.interval" placeholder="86400" />
          </n-form-item>
        </div>
        <p class="muted small" style="margin: 0 0 14px">
          服务端不会拉取这个文件，也不会缓存内容：`rule-providers` 只把链接写进生成的配置，由客户端按上面的更新间隔自己拉取。
        </p>
      </template>
      <template v-else>
        <div class="rule-editor">
          <div class="rule-row rule-row-head small">
            <span>匹配方式</span>
            <span>匹配内容</span>
            <span>命中后策略组</span>
            <span></span>
          </div>
          <div v-for="(row, index) in rows" :key="row.uid" class="rule-row">
            <n-select
              v-model:value="row.type"
              :options="typeOptions"
              size="small"
              filterable
              tag
              placeholder="匹配方式"
            />
            <n-input
              v-model:value="row.value"
              size="small"
              :placeholder="valueHint(row.type)"
              :disabled="isMatchRow(row.type)"
            />
            <n-select
              v-model:value="row.target"
              :options="groupOptions"
              size="small"
              clearable
              :placeholder="defaultTargetHint"
            />
            <div class="rule-row-actions">
              <n-checkbox v-if="supportsNoResolve(row.type)" v-model:checked="row.noResolve" size="small">
                no-resolve
              </n-checkbox>
              <n-button size="tiny" quaternary type="error" @click="removeRow(index)">删除</n-button>
            </div>
          </div>
        </div>
        <n-space align="center" style="margin: 10px 0 14px" :size="10">
          <n-button size="small" @click="addRow">添加规则</n-button>
          <span class="muted small">「命中后策略组」留空表示走上面的默认目标；MATCH 兜底行必须指定目标。</span>
        </n-space>
      </template>
      <n-form-item label="备注（可选）">
        <n-input v-model:value="form.description" placeholder="例如：来自 xxx 仓库，只影响广告域名" maxlength="200" />
      </n-form-item>
      <n-checkbox v-model:checked="form.enabled">启用（停用后订阅里不再引用它）</n-checkbox>
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
import {
  NButton,
  NCheckbox,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  useMessage
} from 'naive-ui';
import { RULE_TYPES, formatRuleLines, parseRuleLines, ruleTypeMeta, supportsNoResolve } from '@shared/rule-lines.js';
import { api } from '../api.js';
const props = defineProps({
  show: { type: Boolean, default: false },
  model: { type: Object, default: null },
  groupOptions: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:show', 'saved']);
const message = useMessage();
const saving = ref(false);
const behaviorOptions = [
  { label: 'classical（混合规则，blackmatrix7 常用）', value: 'classical' },
  { label: 'domain（纯域名规则）', value: 'domain' },
  { label: 'ipcidr（纯 IP 段规则）', value: 'ipcidr' }
];
const typeOptions = RULE_TYPES.map((item) => ({ label: item.label, value: item.value }));
function blank() {
  return {
    name: '',
    type: 'url',
    group: '',
    behavior: 'classical',
    url: '',
    interval: '86400',
    content: '',
    description: '',
    enabled: true
  };
}
const form = reactive(blank());
let rowSeq = 0;
function newRow(init) {
  const source = init || {};
  const extra = Array.isArray(source.extra) ? source.extra : [];
  return {
    uid: ++rowSeq,
    type: source.type || 'DOMAIN-SUFFIX',
    value: source.value || '',
    target: source.target || '',
    noResolve: extra.includes('no-resolve')
  };
}
const rows = ref([]);
const targetGroupLabel = computed(() =>
  form.type === 'url' ? '目标策略组（整包命中后走这里）' : '默认目标策略组（规则行未单独指定时使用）'
);
const defaultTargetHint = computed(() => (form.group ? '默认：' + form.group : '用规则集目标'));
function isMatchRow(type) {
  return String(type || '').trim().toUpperCase() === 'MATCH';
}
function valueHint(type) {
  const meta = ruleTypeMeta(type);
  return (meta && meta.hint) || '匹配内容';
}
function addRow() {
  rows.value.push(newRow({ type: 'DOMAIN-SUFFIX' }));
}
function removeRow(index) {
  rows.value.splice(index, 1);
}
watch(
  () => props.show,
  (visible) => {
    if (!visible) return;
    const source = props.model || {};
    Object.assign(form, blank(), {
      name: source.name || '',
      type: source.type === 'inline' ? 'inline' : 'url',
      group: source.group || (props.groupOptions[0] && props.groupOptions[0].value) || '',
      behavior: source.behavior || 'classical',
      url: source.url || '',
      interval: String(source.interval || '86400'),
      content: source.content || '',
      description: source.description || '',
      enabled: source.enabled !== false
    });
    rows.value = parseRuleLines(form.content).map((row) => newRow(row));
    if (form.type === 'inline' && !rows.value.length) rows.value.push(newRow({ type: 'DOMAIN-SUFFIX' }));
  },
  { immediate: true }
);
watch(
  () => form.type,
  (value) => {
    if (value === 'inline' && !rows.value.length) rows.value.push(newRow({ type: 'DOMAIN-SUFFIX' }));
  }
);
async function save() {
  if (!form.name.trim()) {
    message.error('请填写名称');
    return;
  }
  if (!form.group) {
    message.error('请选择目标策略组');
    return;
  }
  let content = form.content;
  if (form.type === 'url') {
    if (!form.url.trim()) {
      message.error('请填写规则文件链接');
      return;
    }
  } else {
    const cleaned = rows.value
      .map((row) => ({
        type: String(row.type || '').trim(),
        value: String(row.value || '').trim(),
        target: String(row.target || '').trim(),
        noResolve: Boolean(row.noResolve)
      }))
      .filter((row) => row.type);
    if (!cleaned.length) {
      message.error('至少添加一条规则');
      return;
    }
    const missing = cleaned.findIndex((row) => !isMatchRow(row.type) && !row.value);
    if (missing >= 0) {
      message.error('第 ' + (missing + 1) + ' 条规则缺少匹配内容');
      return;
    }
    content = formatRuleLines(
      cleaned.map((row) => ({
        type: row.type,
        value: row.value,
        target: row.target || (isMatchRow(row.type) ? form.group : ''),
        extra: row.noResolve ? ['no-resolve'] : []
      }))
    );
    if (!content.trim()) {
      message.error('至少添加一条规则');
      return;
    }
  }
  saving.value = true;
  try {
    const payload = Object.assign({}, form, { content });
    if (props.model && props.model.id) await api.updateRuleSet(props.model.id, payload);
    else await api.createRuleSet(payload);
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
