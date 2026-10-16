<script>
import AsyncButton from '@shell/components/AsyncButton';
import Banner from '@components/Banner/Banner.vue';
import Checkbox from '@components/Form/Checkbox/Checkbox.vue';
import { LabeledInput } from '@components/Form/LabeledInput';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { SUSE_MANAGER_LINK_ANNOTATION, SUMA_SERVER_RESOURCE_NAME } from '../../shared/definitions';
import { sumaCreateSystemGroup, sumaListAllGroups } from '../../shared/api';

export default {
  name: 'SuseManagerManageLinkDialog',

  components: {
    AsyncButton,
    Banner,
    Checkbox,
    LabeledInput,
    LabeledSelect
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
    const clusterName = this.resources?.[0]?.metadata?.name || '';

    return {
      busy:                false,
      loadingSystemGroups: false,
      suseManagerId:       '',
      createNewGroup:      true,
      newGroupName:        clusterName,
      systemGroup:         '',
      suseManagerOptions:  [],
      systemGroupOptions:  [],
      error:               undefined,
    };
  },

  computed: {
    valid() {
      if (!this.suseManagerId) {
        return false;
      }

      return this.createNewGroup ? !!this.newGroupName?.trim() : !!this.systemGroup;
    },
  },

  methods: {
    closeDialog() {
      this.$emit('close', false);
    },

    async saveLink(buttonDone) {
      // Grey out the form fields and the cancel button while we are saving
      this.busy = true;
      this.error = undefined;

      if (this.resources.length !== 1) {
        this.error = 'Only expecting a single resource';
        this.busy = false;
        buttonDone(false);

        return;
      }

      let groupName;

      if (this.createNewGroup) {
        groupName = this.newGroupName.trim();

        try {
          await sumaCreateSystemGroup(this.$store, this.suseManagerId, groupName);
        } catch (e) {
          this.error = e?.message || 'Unable to create system group';
          this.busy = false;
          buttonDone(false);

          return;
        }
      } else {
        groupName = this.systemGroup;
      }

      // The action is registered against provisioning.cattle.io.cluster, so
      // resources[0] is already the provisioning cluster we need to annotate.
      const cluster = this.resources[0];

      cluster.setAnnotation(SUSE_MANAGER_LINK_ANNOTATION, `${ this.suseManagerId }/${ groupName }`);

      try {
        await cluster.save();
      } catch (e) {
        this.error = e?.message || 'Unable to save cluster annotation';
        this.busy = false;
        buttonDone(false);

        return;
      }

      buttonDone(true);
      this.$emit('close', true);
    },

    async suseManagerChanged() {
      // Clear the system groups
      this.systemGroupOptions = [];
      this.error = undefined;
      // Reset the selected system group
      this.systemGroup = '';

      if (this.createNewGroup) {
        return;
      }

      await this.loadSystemGroups();
    },

    async loadSystemGroups() {
      if (!this.suseManagerId) {
        return;
      }

      this.loadingSystemGroups = true;
      try {
        const groups = await sumaListAllGroups(this.$store, this.suseManagerId);

        this.systemGroupOptions = groups.map((g) => {
          return {
            label: `${ g.name } - ${ g.description }`,
            value: g.name,
          };
        });
      } catch (e) {
        this.error = 'Unable to fetch system groups from the SUSE Multi-Linux Manager server';
      } finally {
        this.loadingSystemGroups = false;
      }
    },

    async onCreateNewGroupChanged(val) {
      this.error = undefined;

      if (!val && this.suseManagerId && this.systemGroupOptions.length === 0) {
        await this.loadSystemGroups();
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
          label="SUSE Multi-Linux Manager Server"
          :options="suseManagerOptions"
          :disabled="busy"
          class="version-selector mt-10"
          data-testid="link-suma-modal-select-server"
          @selecting="suseManagerChanged"
        />
        <Checkbox
          v-model:value="createNewGroup"
          class="version-selector mt-10"
          label="Create a new System Group"
          :disabled="busy"
          data-testid="link-suma-modal-create-group-checkbox"
          @update:value="onCreateNewGroupChanged"
        />
        <LabeledInput
          v-if="createNewGroup"
          v-model:value="newGroupName"
          label="System Group"
          :disabled="busy"
          class="version-selector mt-10"
          data-testid="link-suma-modal-new-group-name"
        />
        <LabeledSelect
          v-else
          v-model:value="systemGroup"
          label="System Group"
          :options="systemGroupOptions"
          :disabled="busy || systemGroupOptions.length === 0"
          class="version-selector mt-10"
          data-testid="link-suma-modal-select-group"
        />
        <Banner
          v-if="!createNewGroup && suseManagerId && !error && !loadingSystemGroups && systemGroupOptions.length === 0"
          color="error"
        >
          No system groups are available on the selected SUSE Multi-Linux Manager server.
        </Banner>
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
          action-label="Link"
          data-testid="link-suma-modal-link-btn"
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
