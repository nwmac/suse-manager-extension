<script>
import AsyncButton from '@shell/components/AsyncButton';
import Banner from '@components/Banner/Banner.vue';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { SUSE_MANAGER_LINK_ANNOTATION, SUMA_SERVER_RESOURCE_NAME } from '../../shared/definitions';
import { sumaListAllGroups } from '../../shared/api';

export default {
  name: 'SuseManagerRemoveLinkDialog',

  components: {
    AsyncButton,
    Banner,
    LabeledSelect
    // LabeledSelect,
    // AppModal,
  },

  props: {
    resources: {
      type:     Array,
      required: true
    },
  },

  async fetch() {
    console.log('Fetch');

    if (this.$store.getters['management/schemaFor'](SUMA_SERVER_RESOURCE_NAME)) {
      const servers = await this.$store.dispatch('management/findAll', { type: SUMA_SERVER_RESOURCE_NAME, opt: { force: true } });

      console.log(servers);

      this.suseManagerOptions = servers.map((s) => {
        console.log(s);

        return {
          label: s.metadata.name,
          value: s.metadata.name,
        };
      });

      if (this.suseManagerOptions.length === 1) {
        this.suseManagerId = this.suseManagerOptions[0].value;
        this.suseManagerChanged();
      }
    }
  },

  data() {
    const data = {
      busy:               false,
      suseManagerId:      '',
      systemGroup:        '',
      suseManagerOptions: [],
      systemGroupOptions: [],
      error:              undefined,
    };

    if (this.resources.length === 1) {
      const cluster = this.resources[0];
      const link = cluster.metadata?.annotations?.[SUSE_MANAGER_LINK_ANNOTATION];
      const p = link.split('/');

      data.suseManagerId = p[0];
      data.systemGroup = p.length > 1 ? p[1] : 'Unknown';
    }

    return data;
  },

  computed: {
    valid() {
      return this.suseManagerId && this.systemGroup;
    },

    __suseManagerOptions() {
      return [
        {
          label: 'Test 1',
          value: 'test1'
        }
      ]
    },
  },

  methods: {
    closeDialog() {
      this.$emit('close', false);
    },

    async saveLink(buttonDone) {
      // Grey out the form fields and the cancel button while we are saving
      this.busy = true;

      if (this.resources.length === 1) {
        const cluster = this.resources[0];

        cluster.setAnnotation(SUSE_MANAGER_LINK_ANNOTATION);

        const save = await cluster.save();

        // TODO: Check the response

        console.error(save);

        buttonDone(true);
        this.$emit('close', true);
      } else {
        this.error = 'Only expecting a single resource';
        this.busy = false;
        buttonDone(false);
      }
    },
  }
};
</script>
<template>
  <div class="plugin-install-dialog">
    <h4 class="title mt-10">
      Remove link to SUSE Multi-Linux Manager
    </h4>
    <div class="custom mt-10">
      <div class="dialog-panel">
        <p>
          This Cluster is currently linked to the SUSE Multi-Linux Manager Server '{{ suseManagerId }}', using systems
          in the system group '{{ systemGroup }}'.
        </p>
        <p><b>Proceeding will remove this link</b></p>
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
          data-testid="install-ext-modal-cancel-btn"
          @click="closeDialog(false)"
        >
          {{ t('generic.cancel') }}
        </button>
        <AsyncButton
          data-testid="install-ext-modal-install-btn"
          @click="saveLink"
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
      min-height: 100px;

      p {
        margin-bottom: 5px;
      }

      .dialog-info {
        flex: 1;
      }

      .toggle-advanced {
        display: flex;
        align-items: center;
        cursor: pointer;
        margin: 10px 0;

        &:hover {
          text-decoration: none;
          color: var(--link);
        }
      }

      .version-selector {
        margin: 0 10px 10px 10px;
        width: auto;
      }
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
