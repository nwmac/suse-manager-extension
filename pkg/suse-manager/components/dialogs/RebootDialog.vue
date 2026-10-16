<script>
import AsyncButton from '@shell/components/AsyncButton';
import Banner from '@components/Banner/Banner.vue';
import { sumaScheduleSystemReboot } from '../../shared/api';

export default {
  name: 'SuseManagerRebootDialog',

  components: { AsyncButton, Banner },

  props: {
    // Passed by PromptModal via `componentProps` on the promptModal payload.
    sid: {
      type:     [String, Number],
      required: true,
    },
    suseManagerId: {
      type:     String,
      required: true,
    },
    systemName: {
      type:    String,
      default: 'this system',
    },
  },

  data() {
    return {
      busy:  false,
      error: undefined,
    };
  },

  methods: {
    closeDialog() {
      this.$emit('close', false);
    },

    async scheduleReboot(buttonDone) {
      this.busy = true;
      this.error = undefined;

      const res = await sumaScheduleSystemReboot(this.$store, this.suseManagerId, this.sid);

      if (res?.okay) {
        buttonDone(true);
        this.$emit('close', true);
      } else {
        this.error = res?.error || 'Failed to schedule reboot';
        this.busy = false;
        buttonDone(false);
      }
    },
  },
};
</script>

<template>
  <div class="plugin-install-dialog">
    <h4 class="title mt-10">
      Reboot System
    </h4>
    <div class="custom mt-10">
      <div class="dialog-panel">
        <p>
          Are you sure you want to reboot <b>{{ systemName }}</b>?
        </p>
        <p>
          This will schedule a reboot in SUSE Multi-Linux Manager.
        </p>
        <Banner
          v-if="error"
          color="error"
        >
          {{ error }}
        </Banner>
      </div>
      <div class="dialog-buttons">
        <button
          :disabled="busy"
          class="btn role-secondary"
          @click="closeDialog(false)"
        >
          {{ t('generic.cancel') }}
        </button>
        <AsyncButton
          action-label="Reboot"
          action-color="bg-error"
          @click="scheduleReboot"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .plugin-install-dialog {
    padding: 10px;

    p {
      line-height: 1.25;
      margin-bottom: 5px;
    }

    h4 {
      font-weight: bold;
    }

    .title {
      border-bottom: 1px solid var(--border);
      margin: 5px -10px !important;
      padding: 0 10px 10px 10px;
    }

    .dialog-panel {
      display: flex;
      flex-direction: column;
      min-height: 80px;
    }

    .dialog-buttons {
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;

      > *:not(:last-child) {
        margin-right: 20px;
      }
    }
  }
</style>
