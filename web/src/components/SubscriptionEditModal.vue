<template>
  <n-modal
    :show="show"
    preset="card"
    title="订阅设置"
    :style="{ width: '900px', maxWidth: '96vw' }"
    :mask-closable="false"
    @update:show="(value) => emit('update:show', value)"
  >
    <div class="edit-grid">
      <div class="edit-main">
        <n-form label-placement="top" :model="form">
          <n-form-item label="订阅名称">
            <n-input v-model:value="form.name" placeholder="例如：香港优选" maxlength="40" />
          </n-form-item>
          <n-form-item label="原始 VLESS 链接（3x-ui 导出）">
            <n-input
              v-model:value="form.baseLink"
              type="textarea"
              :rows="3"
              placeholder="vless://uuid@你的域名:443?type=ws&security=tls&sni=你的域名&host=你的域名&path=%2Fws#节点名"
            />
          </n-form-item>
          <n-form-item :label="'IP / 域名 / 网址列表（每行一个，当前 ' + preview.linkCount + ' 个节点）'">
            <n-input
              v-model:value="form.ipText"
              type="textarea"
              :rows="10"
              placeholder="1.2.3.4&#10;1.2.3.5:2053&#10;[2606:4700::6810:85e5]:443&#10;104.16.0.1 # 备注"
            />
          </n-form-item>
          <p class="muted small" style="margin: -4px 0 10px">
            支持 IP、域名，或直接粘贴网址（如 <code>https://speed.example.com:8443/ws</code>，会自动取主机名与端口）；
            相同的“主机:端口”会自动去重（去重开关见下方）。
          </p>
          <div class="two-col">
            <n-form-item label="额外端口（留空则使用原端口）">
              <n-input v-model:value="form.extraPorts" placeholder="443,2053,2087,8443" />
            </n-form-item>
            <n-form-item label="节点名模板">
              <n-input v-model:value="form.nameTemplate" placeholder="{ip}-{port}" />
            </n-form-item>
          </div>
          <n-form-item label="参数批量替换（对所有生成的链接生效）">
            <n-input
              v-model:value="form.paramOverrides"
              type="textarea"
              :rows="4"
              placeholder="sni=cdn.example.com&#10;host=cdn.example.com&#10;path=/ws&#10;fp=chrome&#10;allowInsecure="
            />
          </n-form-item>
          <n-space :size="6" align="center" style="margin: -6px 0 8px">
            <n-button size="tiny" :disabled="!baseParams.length" @click="fillCurrentParams">填入原链接参数</n-button>
            <n-button size="tiny" :disabled="!form.paramOverrides" @click="form.paramOverrides = ''">清空</n-button>
            <span class="muted small">每行一个 <code>key=value</code>，值留空表示删除该参数</span>
          </n-space>
          <div v-if="baseParams.length" class="chips" style="margin: -4px 0 10px">
            <n-tag v-for="item in baseParams" :key="item.k" size="small" :bordered="false">
              {{ item.k }}={{ item.v }}
            </n-tag>
          </div>
          <n-divider style="margin: 6px 0 12px">Clash / mihomo 订阅</n-divider>
          <n-form-item label="Clash 输出方式">
            <n-radio-group v-model:value="form.clashMode">
              <n-space>
                <n-radio value="fragment">仅 proxies 片段</n-radio>
                <n-radio value="full">完整配置（策略组 + 分流规则）</n-radio>
              </n-space>
            </n-radio-group>
          </n-form-item>
          <template v-if="form.clashMode === 'full'">
            <n-form-item label="引用策略组（不选 = 使用全部启用的策略组）">
              <n-select
                v-model:value="form.clashGroupIds"
                multiple
                :options="groupOptions"
                placeholder="在「规则管理 → 策略组」里维护"
              />
            </n-form-item>
            <n-form-item label="默认策略组（未命中规则时走这里）">
              <n-select
                v-model:value="form.clashFinalGroup"
                :options="finalGroupOptions"
                clearable
                placeholder="留空自动使用 🐟 漏网之鱼"
              />
            </n-form-item>
            <n-form-item label="引用规则集（在「规则管理」页面维护）">
              <n-select
                v-model:value="form.clashRuleSetIds"
                multiple
                :options="ruleSetOptions"
                placeholder="可多选；顺序即优先级，规则集先于预设规则生效"
              />
            </n-form-item>
            <n-form-item label="自定义规则（每行一条，会插在 MATCH 之前）">
              <n-input
                v-model:value="form.clashCustomRules"
                type="textarea"
                :rows="4"
                placeholder="DOMAIN-SUFFIX,example.com,🚀 节点选择&#10;IP-CIDR,1.2.3.0/24,🎯 全球直连,no-resolve"
              />
            </n-form-item>
            <n-form-item label="mixed-port（HTTP/SOCKS 混合端口）">
              <n-input v-model:value="form.clashMixedPort" style="max-width: 160px" placeholder="7890" />
            </n-form-item>
            <p class="muted small" style="margin: -6px 0 8px">
              策略组与规则集都在「规则管理」页面维护：先定义策略组，再让规则集指向它，最后在订阅里选择引用哪些。规则集里指向的策略组若未包含在本次生成中，会自动回退到默认策略组并在配置文件顶部注明。
            </p>
          </template>
          <n-space vertical :size="6" style="margin-bottom: 6px">
            <n-checkbox v-model:checked="form.useLinePort">IP 行自带端口时优先使用</n-checkbox>
            <n-checkbox v-model:checked="form.dedupe">按 IP:端口 去重</n-checkbox>
            <n-checkbox v-model:checked="form.enabled">启用公开分享（关闭后订阅地址返回 403）</n-checkbox>
          </n-space>
          <p class="muted small" style="margin: 0">
            模板输出就是最终节点名，会覆盖链接里 <code>#</code> 后面的原备注（客户端显示的就是这个名字）。默认 <code>{ip}-{port}</code>。
          </p>
          <p class="muted small" style="margin: 4px 0 0">
            占位符：{ip} 地址 · {port} 端口 · {index} 序号 · {name} 原链接备注 · {remark} IP 行备注 · {domain} 源域名
          </p>
        </n-form>
      </div>
      <div class="edit-side">
        <div class="side-title">实时预览</div>
        <n-alert v-if="preview.error" type="error" :show-icon="false">{{ preview.error }}</n-alert>
        <template v-else>
          <n-alert
            v-if="preview.warnings.length"
            type="warning"
            :show-icon="false"
            style="margin-bottom: 10px"
          >
            <div v-for="(warn, index) in preview.warnings" :key="index">· {{ warn }}</div>
          </n-alert>
          <div v-if="preview.parsed" class="chips">
            <n-tag size="small" :bordered="false">{{ preview.parsed.net }}</n-tag>
            <n-tag size="small" :bordered="false">{{ preview.parsed.security || 'tls' }}</n-tag>
            <n-tag size="small" :bordered="false">{{ preview.parsed.hostHeader || preview.parsed.host }}</n-tag>
          </div>
          <div class="preview-list">
            <div v-for="link in preview.links" :key="link.index" class="preview-item">
              <div class="preview-name">{{ link.name }}</div>
              <div class="preview-url mono">{{ link.url }}</div>
            </div>
            <div v-if="!preview.links.length" class="muted small">填写链接与 IP 后，这里会显示预览</div>
          </div>
          <div v-if="preview.linkCount > preview.links.length" class="muted small" style="margin-top: 8px">
            仅显示前 {{ preview.links.length }} 条，共 {{ preview.linkCount }} 条
          </div>
        </template>
      </div>
    </div>
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
  NAlert,
  NButton,
  NCheckbox,
  NDivider,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui';
import { DEFAULT_NAME_TEMPLATE, generateSubscription, parseVless } from '@shared/vless.js';
import { api } from '../api.js';
const props = defineProps({
  show: { type: Boolean, default: false },
  model: { type: Object, default: null }
});
const emit = defineEmits(['update:show', 'saved']);
const message = useMessage();
const saving = ref(false);
function blank() {
  return {
    name: '',
    baseLink: '',
    ipText: '',
    extraPorts: '',
    nameTemplate: DEFAULT_NAME_TEMPLATE,
    paramOverrides: '',
    clashMode: 'fragment',
    clashGroupIds: [],
    clashFinalGroup: '',
    clashCustomRules: '',
    clashMixedPort: '7890',
    clashRuleSetIds: [],
    useLinePort: true,
    dedupe: true,
    enabled: true
  };
}
const form = reactive(blank());
watch(
  () => props.show,
  (visible) => {
    if (!visible) return;
    loadRuleSets();
    loadGroups();
    const source = props.model || {};
    Object.assign(form, blank(), {
      name: source.name || '',
      baseLink: source.baseLink || '',
      ipText: source.ipText || '',
      extraPorts: source.extraPorts || '',
      nameTemplate: source.nameTemplate || DEFAULT_NAME_TEMPLATE,
      paramOverrides: source.paramOverrides || '',
      clashMode: source.clashMode === 'full' ? 'full' : 'fragment',
      clashGroupIds: Array.isArray(source.clashGroupIds) ? source.clashGroupIds.slice() : [],
      clashFinalGroup: source.clashFinalGroup || '',
      clashCustomRules: source.clashCustomRules || '',
      clashMixedPort: source.clashMixedPort || '7890',
      clashRuleSetIds: Array.isArray(source.clashRuleSetIds) ? source.clashRuleSetIds.slice() : [],
      useLinePort: source.useLinePort !== false,
      dedupe: source.dedupe !== false,
      enabled: source.enabled !== false
    });
  },
  { immediate: true }
);
const preview = computed(() => {
  const result = generateSubscription(form);
  return {
    error: result.error || '',
    warnings: result.warnings || [],
    parsed: result.parsed
      ? {
          net: result.parsed.net,
          security: result.parsed.security,
          host: result.parsed.host,
          hostHeader: result.parsed.hostHeader
        }
      : null,
    linkCount: (result.links || []).length,
    links: (result.links || []).slice(0, 6)
  };
});
const ruleSetOptions = ref([]);
const groupOptions = ref([]);
const finalGroupOptions = ref([]);
async function loadGroups() {
  try {
    const data = await api.proxyGroups();
    const items = (data && data.items) || [];
    groupOptions.value = items.map((item) => ({ label: item.name + '（' + item.type + '）', value: item.id }));
    const targets = items.map((item) => ({ label: item.name, value: item.name }));
    targets.push({ label: 'DIRECT', value: 'DIRECT' });
    targets.push({ label: 'REJECT', value: 'REJECT' });
    finalGroupOptions.value = targets;
  } catch (err) {
    groupOptions.value = [];
    finalGroupOptions.value = [];
  }
}
async function loadRuleSets() {
  try {
    const data = await api.ruleSets();
    ruleSetOptions.value = ((data && data.items) || []).map((item) => ({
      label: item.name + ' → ' + item.group,
      value: item.id
    }));
  } catch (err) {
    ruleSetOptions.value = [];
  }
}
const baseParams = computed(() => {
  try {
    const parsed = parseVless(form.baseLink);
    return Array.from(parsed.params.entries()).map(([key, value]) => ({ k: key, v: value }));
  } catch (err) {
    return [];
  }
});
function fillCurrentParams() {
  form.paramOverrides = baseParams.value.map((item) => item.k + '=' + item.v).join('\n');
}
async function save() {
  if (!form.baseLink.trim()) {
    message.error('请填写原始 VLESS 链接');
    return;
  }
  saving.value = true;
  try {
    const payload = Object.assign({}, form);
    if (props.model && props.model.id) {
      await api.update(props.model.id, payload);
    } else {
      await api.create(payload);
    }
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
