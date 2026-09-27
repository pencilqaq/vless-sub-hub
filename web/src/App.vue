<template>
  <n-config-provider :theme="darkTheme" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <router-view />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
<script setup>
import { NConfigProvider, NDialogProvider, NMessageProvider, darkTheme, dateZhCN, zhCN } from 'naive-ui';
</script>
