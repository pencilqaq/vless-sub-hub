<template>
  <div class="rule-table-wrap">
    <table class="rule-table">
      <thead>
        <tr>
          <th>匹配方式</th>
          <th>匹配内容</th>
          <th>命中后策略组</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in shownRows" :key="index">
          <td class="mono">{{ row.type }}</td>
          <td class="mono">
            <span v-if="row.value" :title="row.value">{{ row.value }}</span>
            <span v-else class="muted">—</span>
          </td>
          <td class="mono">
            <span v-if="row.target">{{ row.target }}</span>
            <span v-else class="muted">{{ fallbackGroup ? '用规则集目标：' + fallbackGroup : '用规则集目标' }}</span>
            <n-tag
              v-for="modifier in row.extra || []"
              :key="modifier"
              size="tiny"
              :bordered="false"
              style="margin-left: 6px"
            >
              {{ modifier }}
            </n-tag>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="hiddenCount" class="muted small" style="margin: 6px 0 0">还有 {{ hiddenCount }} 条未显示</p>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import { NTag } from 'naive-ui';
const props = defineProps({
  rows: { type: Array, default: () => [] },
  fallbackGroup: { type: String, default: '' },
  maxRows: { type: Number, default: 0 }
});
const shownRows = computed(() => (props.maxRows > 0 ? props.rows.slice(0, props.maxRows) : props.rows));
const hiddenCount = computed(() => (props.maxRows > 0 ? Math.max(0, props.rows.length - props.maxRows) : 0));
</script>
