<script>
import AsyncButton from '@shell/components/AsyncButton';
import Banner from '@components/Banner/Banner.vue';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { SUSE_MANAGER_LINK_ANNOTATION, SUMA_SERVER_RESOURCE_NAME } from '../../shared/definitions';
import { sumaListAllGroups } from '../../shared/api';

export default {
  name: 'SuseManagerManageLinkDialog',

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
    return {
      busy:               false,
      suseManagerId:      '',
      systemGroup:        '',
      suseManagerOptions: [],
      systemGroupOptions: [],
      error:              undefined,
    };
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

        cluster.setAnnotation(SUSE_MANAGER_LINK_ANNOTATION, `${ this.suseManagerId }/${ this.systemGroup }`);

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

    async suseManagerChanged(v) {
      console.error('SUSE MANAGER CHANGED');

      // Clear the system groups
      this.systemGroupOptions = [];
      this.error = undefined;
      // Reset the selected system group
      this.systemGroup = '';

      console.log(this);
      console.log(this.suseManagerId);

      // Fetch the system groups for the SUSE Manager Server
      try {
        const groups = await sumaListAllGroups(this.$store, this.suseManagerId);

        console.log(groups);
        this.systemGroupOptions = groups.map((g) => {
          return {
            label: `${ g.name } - ${ g.description }`,
            value: g.name,
          };
        });
      } catch (e) {
        this.error = 'Unable to fetch system groups from the SUSE Multi-Linux Manager server';
      }
    }
  }
};
</script>
<template>
  <div class="plugin-install-dialog">
    <h4 class="title mt-10">
      Link to SUSE Multi-Linux Manager
    </h4>
    <div class="custom mt-10">
      <div class="dialog-panel">
        <p>
          Linking this cluster to a SUSE Multi-Linux Manager Server will allow machines used by the cluster to be
          linked back to systems in SUSE Multi-Linux Manager and allows patch status to be shown for these systems
          and for patch updated to made from within the Rancher UI.
        </p>
        <LabeledSelect
          v-model:value="suseManagerId"
          label-key="plugins.install.version"
          :options="suseManagerOptions"
          :disabled="busy"
          class="version-selector mt-10"
          data-testid="install-ext-modal-select-version"
          @selecting="suseManagerChanged"
        />
        <LabeledSelect
          v-model:value="systemGroup"
          label="System Group"
          _label-key="plugins.install.version"
          :options="systemGroupOptions"
          :disabled="busy || systemGroupOptions.length === 0"
          class="version-selector mt-10"
          data-testid="install-ext-modal-select-version"
        />
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
          :disabled="!valid"
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
