<script lang="ts" setup>
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.bilibili_features.vip_features')">
      <SettingsItem :title="$t('settings.show_bcoin_receive_reminder')">
        <Radio v-model="settings.showBCoinReceiveReminder" />
      </SettingsItem>
      <SettingsItem
        v-if="settings.showBCoinReceiveReminder"
        :title="$t('settings.auto_receive_bcoin_coupon')"
        :desc="$t('settings.auto_receive_bcoin_coupon_desc')"
      >
        <Radio v-model="settings.autoReceiveBCoinCoupon" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
