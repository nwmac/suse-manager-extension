<script>
import { CAPI } from '@shell/config/types';
import AsyncButton from '@shell/components/AsyncButton';
import Banner from '@components/Banner/Banner.vue';
import Checkbox from '@components/Form/Checkbox/Checkbox.vue';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { SUSE_MANAGER_LINK_ANNOTATION } from '../../shared/definitions';
import {
  sumaGetSystemsInSystemGroup,
  sumaListActivationKeys,
  sumaBootstrapSystem,
  fetchMachineSshConfig,
} from '../../shared/api';

const STATUS_REGISTERED = 'registered';
const STATUS_NOT_REGISTERED = 'not-registered';
const STATUS_UNAVAILABLE = 'unavailable';
const STATUS_PENDING = 'pending';
const STATUS_RUNNING = 'running';
const STATUS_SUCCESS = 'success';
const STATUS_ERROR = 'error';

export default {
  name: 'SuseManagerRegisterNodesDialog',

  components: {
    AsyncButton,
    Banner,
    Checkbox,
    LabeledSelect,
  },

  props: {
    resources: {
      type:     Array,
      required: true
    },
  },

  data() {
    const cluster = this.resources?.[0];
    const link = cluster?.metadata?.annotations?.[SUSE_MANAGER_LINK_ANNOTATION] || '';
    const [suseManagerId, systemGroupName] = link.split('/');

    return {
      cluster,
      suseManagerId:    suseManagerId || '',
      systemGroupName:  systemGroupName || '',
      loadError:        undefined,
      rows:             [],
      activationKeys:   [],
      activationKey:    '',
      registering:      false,
      registerError:    undefined,
    };
  },

  async fetch() {
    if (!this.cluster) {
      this.loadError = 'No cluster supplied to dialog.';

      return;
    }

    if (!this.suseManagerId || !this.systemGroupName) {
      this.loadError = 'This cluster is not linked to a SUSE Multi-Linux Manager.';

      return;
    }

    try {
      const allMachines = await this.$store.dispatch('management/findAll', { type: CAPI.MACHINE });

      const clusterMachines = (allMachines || []).filter((m) => {
        return m.metadata?.namespace === this.cluster.metadata.namespace
          && m.spec?.clusterName === this.cluster.metadata.name;
      });

      const [sumaSystems, activationKeys] = await Promise.all([
        sumaGetSystemsInSystemGroup(this.$store, this.suseManagerId, this.systemGroupName)
          .then((s) => Array.isArray(s) ? s : []),
        sumaListActivationKeys(this.$store, this.suseManagerId).catch(() => []),
      ]);

      this.activationKeys = activationKeys;

      this.rows = clusterMachines.map((machine) => {
        const ips = machine.internalIps || [];
        const matched = sumaSystems.find((s) => ips.includes(s.network?.ip));
        const hasSshKeys = !!machine.links?.sshkeys;

        let status;

        if (matched) {
          status = STATUS_REGISTERED;
        } else if (!hasSshKeys) {
          status = STATUS_UNAVAILABLE;
        } else {
          status = STATUS_NOT_REGISTERED;
        }

        return {
          id:             machine.id,
          name:           machine.nameDisplay || machine.metadata?.name,
          ips,
          ip:             machine.internalIp || ips[0] || '',
          machine,
          hasSshKeys,
          sumaSystemId:   matched?.id,
          sumaSystemName: matched?.profile_name || matched?.name,
          status,
          selected:       false,
          message:        '',
        };
      });
    } catch (e) {
      this.loadError = e?.message || 'Unable to load cluster nodes or SUSE Manager systems.';
    }
  },

  computed: {
    activationKeyOptions() {
      return this.activationKeys
        .filter((k) => !k.disabled)
        .map((k) => ({
          label: k.description ? `${ k.key } — ${ k.description }` : k.key,
          value: k.key,
        }));
    },

    selectableRows() {
      return this.rows.filter((r) => r.status === STATUS_NOT_REGISTERED || r.status === STATUS_ERROR);
    },

    selectedRows() {
      return this.rows.filter((r) => r.selected);
    },

    allSelectableSelected: {
      get() {
        const selectable = this.selectableRows;

        return selectable.length > 0 && selectable.every((r) => r.selected);
      },
      set(v) {
        this.selectableRows.forEach((r) => {
          r.selected = !!v;
        });
      },
    },

    canRegister() {
      return !this.registering
        && !this.loadError
        && !!this.activationKey
        && this.selectedRows.length > 0;
    },
  },

  methods: {
    closeDialog(refresh = false) {
      this.$emit('close', refresh);
    },

    statusLabel(row) {
      switch (row.status) {
      case STATUS_REGISTERED: return `Registered${ row.sumaSystemName ? ` — ${ row.sumaSystemName }` : '' }`;
      case STATUS_NOT_REGISTERED: return 'Not registered';
      case STATUS_UNAVAILABLE: return 'SSH keys unavailable';
      case STATUS_PENDING: return 'Pending…';
      case STATUS_RUNNING: return 'Registering…';
      case STATUS_SUCCESS: return 'Registered';
      case STATUS_ERROR: return `Failed: ${ row.message || 'Unknown error' }`;
      default: return row.status;
      }
    },

    statusClass(row) {
      switch (row.status) {
      case STATUS_REGISTERED:
      case STATUS_SUCCESS:
        return 'status-success';
      case STATUS_ERROR:
        return 'status-error';
      case STATUS_RUNNING:
      case STATUS_PENDING:
        return 'status-progress';
      case STATUS_UNAVAILABLE:
        return 'status-warning';
      default:
        return 'status-neutral';
      }
    },

    async runRegistration(buttonDone) {
      this.registering = true;
      this.registerError = undefined;

      const toRegister = this.selectedRows.slice();

      toRegister.forEach((r) => {
        r.status = STATUS_PENDING;
        r.message = '';
      });

      for (const row of toRegister) {
        row.status = STATUS_RUNNING;

        console.log('[suma] runRegistration: starting row', { id: row.id, name: row.name, rancherInternalIp: row.ip });

        try {
          const ssh = await fetchMachineSshConfig(row.machine);

          // Per the user: prefer the SSH bundle's own config.json IPAddress
          // (Rancher uses this address itself to SSH the node) over the
          // Rancher CAPI internalIp.
          const host = ssh.host || ssh.ipv6 || row.ip;

          console.log('[suma] runRegistration: using host=%s user=%s port=%d for %s', host, ssh.user, ssh.port, row.name);

          if (!host) {
            throw new Error('No reachable IP address (config.json had no IPAddress/IPv6Address and Rancher had no internalIp)');
          }

          if (!ssh.user) {
            throw new Error('SSH bundle config.json did not include SSHUser');
          }

          await sumaBootstrapSystem(this.$store, this.suseManagerId, {
            host,
            sshPort:        ssh.port,
            sshUser:        ssh.user,
            sshPrivKey:     ssh.privateKey,
            sshPrivKeyPass: '',
            activationKey:  this.activationKey,
          });

          console.log('[suma] runRegistration: bootstrap succeeded for', row.name);

          row.status = STATUS_SUCCESS;
          row.message = '';
        } catch (e) {
          console.error('[suma] runRegistration: failed for', row.name, e);
          row.status = STATUS_ERROR;
          row.message = e?.message || 'Bootstrap failed';
        }
      }

      // Refresh the group's systems and re-match by IP so successful
      // registrations flip to "Registered" with their SUMA system info.
      try {
        const refreshed = await sumaGetSystemsInSystemGroup(this.$store, this.suseManagerId, this.systemGroupName);
        const systems = Array.isArray(refreshed) ? refreshed : [];

        for (const row of this.rows) {
          if (row.status === STATUS_SUCCESS || row.status === STATUS_REGISTERED) {
            const match = systems.find((s) => row.ips.includes(s.network?.ip));

            if (match) {
              row.sumaSystemId = match.id;
              row.sumaSystemName = match.profile_name || match.name;
              row.status = STATUS_REGISTERED;
              row.selected = false;
            } else if (row.status === STATUS_SUCCESS) {
              row.message = 'Registered. Not yet visible in linked group — verify the activation key includes this group.';
            }
          }
        }
      } catch (e) {
        this.registerError = `Registrations completed but unable to refresh group membership: ${ e?.message || e }`;
      }

      this.registering = false;

      const hadError = this.rows.some((r) => r.status === STATUS_ERROR);

      buttonDone(!hadError);
    },
  },
};
</script>

<template>
  <div class="register-nodes-dialog">
    <h4 class="title mt-10">
      Register Nodes with SUSE Multi-Linux Manager
    </h4>

    <div class="custom mt-10">
      <Banner
        v-if="loadError"
        color="error"
      >
        {{ loadError }}
      </Banner>

      <template v-else>
        <p class="mb-10">
          Linked to <b>{{ suseManagerId }}</b>, system group <b>{{ systemGroupName }}</b>. SSH credentials
          for each node are read from Rancher.
        </p>

        <LabeledSelect
          v-model:value="activationKey"
          label="Activation Key"
          :options="activationKeyOptions"
          :disabled="registering"
          :required="true"
        />

        <h5 class="mt-20">
          Cluster Nodes
        </h5>

        <table class="nodes-table">
          <thead>
            <tr>
              <th class="select-col">
                <Checkbox
                  v-model:value="allSelectableSelected"
                  :disabled="registering || selectableRows.length === 0"
                />
              </th>
              <th>Node</th>
              <th>Internal IP</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="rows.length === 0">
              <td
                colspan="4"
                class="empty"
              >
                No machines found for this cluster.
              </td>
            </tr>
            <tr
              v-for="row in rows"
              :key="row.id"
            >
              <td class="select-col">
                <Checkbox
                  v-model:value="row.selected"
                  :disabled="registering || (row.status !== 'not-registered' && row.status !== 'error')"
                />
              </td>
              <td>{{ row.name }}</td>
              <td>{{ row.ip || '—' }}</td>
              <td :class="statusClass(row)">
                <i
                  v-if="row.status === 'running'"
                  class="icon icon-spinner icon-spin"
                />
                {{ statusLabel(row) }}
              </td>
            </tr>
          </tbody>
        </table>

        <Banner
          v-if="registerError"
          color="warning"
          class="mt-10"
        >
          {{ registerError }}
        </Banner>
      </template>

      <div class="dialog-buttons mt-20">
        <button
          :disabled="registering"
          class="btn role-secondary"
          @click="closeDialog(false)"
        >
          {{ registering ? 'Close' : t('generic.cancel') }}
        </button>
        <AsyncButton
          :disabled="!canRegister"
          action-label="Register Selected"
          waiting-label="Registering..."
          @click="runRegistration"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .register-nodes-dialog {
    padding: 10px;

    h4.title {
      font-weight: bold;
      border-bottom: 1px solid var(--border);
      margin: 5px -10px !important;
      padding: 0 10px 10px 10px;
    }

    .nodes-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;

      th, td {
        border-bottom: 1px solid var(--border);
        padding: 6px 8px;
        text-align: left;
        vertical-align: middle;
      }

      th {
        font-size: 12px;
        text-transform: uppercase;
        opacity: 0.7;
      }

      .select-col {
        width: 32px;
      }

      .empty {
        text-align: center;
        opacity: 0.7;
        padding: 20px;
      }

      .status-success { color: var(--success); }
      .status-error { color: var(--error); }
      .status-progress { color: var(--info); }
      .status-warning { color: var(--warning); }
      .status-neutral { opacity: 0.7; }

      i {
        margin-right: 4px;
      }
    }

    .dialog-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 20px;
      border-top: 1px solid var(--border);
      padding-top: 10px;
    }
  }
</style>
