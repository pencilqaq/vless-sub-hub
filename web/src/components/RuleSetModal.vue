<template>
  <n-modal
    :show="show"
    preset="card"
    :title="model && model.id ? '编辑规则集' : '新建规则集'"
    :style="{ width: '760px', maxWidth: '96vw' }"
    :mask-closable="false"
    @update:show="(value) => emit('update:show', value)"
  >
    <n-form label-placement="top" :model="form">
      <div class="two-col">
        <n-form-item label="名称">
          <n-input v-model:value="form.name" placeholder="例如：我的直连规则" maxlength="60" />
        </n-form-item>
        <n-form-item label="目标策略组（规则命中的流量走哪里）">
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
        <n-space align="center" style="margin-bottom: 10px">
          <n-button size="small" :loading="testing" @click="testFetch">测试链接</n-button>
          <span class="muted small">服务端会实际拉取一次，确认可达并统计行数</span>
        </n-space>
        <n-alert
          v-if="testResult"
          :type="testResult.ok ? 'success' : 'error'"
          :show-icon="false"
          style="margin-bottom: 12px; white-space: pre-wrap"
        >
          {{ testResult.text }}
        </n-alert>
      </template>
      <template v-else>
        <n-form-item label="规则内容（每行一条）">
          <n-input
            v-model:value="form.content"
            type="textarea"
            :rows="10"
            placeholder="DOMAIN-SUFFIX,example.com&#10;DOMAIN-KEYWORD,google&#10;IP-CIDR,1.2.3.0/24,no-resolve&#10;&#10;只写两段时，会自动补上上面的目标策略组"
          />
        </n-form-item>
        <p class="muted small" style="margin: -6px 0 10px">
          已经写全的规则（如 <code>DOMAIN-SUFFIX,a.com,DIRECT</code>）会原样使用；只写两段的会补上目标策略组。
        </p>
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
import { reactive, ref, watch } from 'vue';
import {
  NAlert,
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
import { api } from '../api.js';
const props = defineProps({
  show: { type: Boolean, default: false },
  model: { type: Object, default: null },
  groupOptions: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:show', 'saved']);
const message = useMessage();
const saving = ref(false);
const testing = ref(false);
const testResult = ref(null);
const behaviorOptions = [
  { label: 'classical（混合规则，blackmatrix7 常用）', value: 'classical' },
  { label: 'domain（纯域名规则）', value: 'domain' },
  { label: 'ipcidr（纯 IP 段规则）', value: 'ipcidr' }
];
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
watch(
  () => props.show,
  (visible) => {
    if (!visible) return;
    const source = props.model || {};
    testResult.value = null;
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
  }
);
async function testFetch() {
  if (!form.url.trim()) {
    message.warning('请先填写规则文件链接');
    return;
  }
  testing.value = true;
  testResult.value = null;
  try {
    const data = await api.testRuleSet({ url: form.url });
    testResult.value = {
      ok: true,
      text: '拉取成功：' + data.lines + ' 行 / ' + data.bytes + ' 字节\n示例：\n' + (data.sample || []).join('\n')
    };
  } catch (err) {
    testResult.value = { ok: false, text: (err && err.message) || '拉取失败' };
  } finally {
    testing.value = false;
  }
}
async function save() {
  if (!form.name.trim()) {
    message.error('请填写名称');
    return;
  }
  if (!form.group) {
    message.error('请选择目标策略组');
    return;
  }
  if (form.type === 'url' && !form.url.trim()) {
    message.error('请填写规则文件链接');
    return;
  }
  if (form.type === 'inline' && !form.content.trim()) {
    message.error('请填写规则内容');
    return;
  }
  saving.value = true;
  try {
    const payload = Object.assign({}, form);
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
