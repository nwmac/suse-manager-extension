<script>
import { groupPatches } from '../shared/utils';
import { SUSE_MANAGER_NAMESPACE, SUMA_SERVER_RESOURCE_NAME } from '../shared/definitions';
import Banner from '@components/Banner/Banner.vue';

export default {
  name: 'SumaServerInfo',

  components: { Banner },

  props: {
    node: {
      type:    Object,
      default: () => {}
    },

    system: {
      type:    Object,
      default: () => {}
    }
  },

  computed: {
    hasSystem() {
      // `system` prop defaults to {} — treat "empty" as no matching MLM system
      return !!(this.system && this.system.id);
    },

    patchSummary() {
      return this.system ? groupPatches(this.system) : { total: 0, security: 0 };
    },

    securityPatches() {
      return this.patchSummary?.security || 0;
    },

    totalPatches() {
      return this.patchSummary?.total || 0;
    },

    rebootRequired() {
      return !!this.system?.reboot_required;
    },

    /**
     * MLM base URL for this system, taken from the SumaServer resource we
     * loaded via SumaPanel's fetch. Used to build deep-links into the MLM UI.
     */
    mlmBaseUrl() {
      const id = this.system?.suseManagerId;

      if (!id) {
        return '';
      }

      const server = this.$store.getters['management/byId'](SUMA_SERVER_RESOURCE_NAME, `${ SUSE_MANAGER_NAMESPACE }/${ id }`);

      return server?.spec?.url || '';
    },

    /**
     * Deep-link to this system's errata (patch) list in the MLM UI.
     */
    errataListUrl() {
      if (!this.mlmBaseUrl || !this.system?.id) {
        return '';
      }

      return `${ this.mlmBaseUrl }/rhn/systems/details/ErrataList.do?sid=${ this.system.id }`;
    },

    /**
     * Deep-link to this system's upgradable packages list in the MLM UI.
     */
    upgradablePackagesUrl() {
      if (!this.mlmBaseUrl || !this.system?.id) {
        return '';
      }

      return `${ this.mlmBaseUrl }/rhn/systems/details/packages/UpgradableList.do?sid=${ this.system.id }`;
    },

    baseChannelLabel() {
      const c = this.system?.baseChannel;

      if (!c) {
        return null;
      }

      return c.label || c.name;
    },

    childChannelLabels() {
      const channels = this.system?.childChannels || [];

      return channels.map((c) => c.label || c.name).filter(Boolean);
    },

    installedProductsLabel() {
      const products = this.system?.installedProducts || [];

      if (!products.length) {
        return null;
      }

      const base = products.find((p) => p.isBaseProduct) || products[0];
      const label = base?.friendlyName || base?.name;

      if (label && base?.version && !label.includes(base.version)) {
        return `${ label } ${ base.version }`;
      }

      return label || null;
    },

    kernelLabel() {
      return this.system?.kernel || null;
    },

    systemTypesLabel() {
      const parts = [];

      if (this.system?.base_entitlement) {
        parts.push(this.system.base_entitlement);
      }

      if (Array.isArray(this.system?.addon_entitlements) && this.system.addon_entitlements.length) {
        parts.push(...this.system.addon_entitlements);
      }

      return parts.length ? `[${ parts.join(', ') }]` : null;
    },

    autoPatchUpdateLabel() {
      if (typeof this.system?.auto_update === 'boolean') {
        return this.system.auto_update ? 'Yes' : 'No';
      }

      return null;
    },

    locationLabel() {
      if (!this.system) {
        return null;
      }

      const parts = [
        this.system.address1,
        this.system.address2,
        this.system.city,
        this.system.state,
        this.system.country,
      ].filter((p) => !!p);

      return parts.length ? parts.join(', ') : null;
    },

    formattedLastBoot() {
      return this.formatDate(this.system?.last_boot);
    },

    formattedRegistered() {
      return this.formatDate(this.system?.registered || this.system?.created);
    },

    formattedCheckedIn() {
      return this.formatDate(this.system?.last_checkin);
    },

    virtualizationHost() {
      return this.system?.virtualization_host || this.system?.virtualizationHost || 'unknown';
    },
  },

  methods: {
    openRebootDialog() {
      if (!this.system?.suseManagerId || !this.system?.id) {
        return;
      }

      this.$store.dispatch('cluster/promptModal', {
        componentProps: {
          sid:           this.system.id,
          suseManagerId: this.system.suseManagerId,
          systemName:    this.system.profile_name || this.system.hostname || '',
        },
        component:  'SuseManagerRebootDialog',
        modalWidth: '450px',
      });
    },

    formatDate(value) {
      if (!value) {
        return null;
      }

      // SUMA date structs come back as ISO strings; be lenient with other shapes.
      const iso = typeof value === 'string' ? value : (value?.$date || value);
      const d = new Date(iso);

      if (isNaN(d.getTime())) {
        return typeof value === 'string' ? value : null;
      }

      return d.toLocaleString();
    },
  },
};
</script>

<template>
  <div class="suma-server-info">
    <div v-if="!hasSystem" class="no-system">
      <Banner
        color="warning"
        label="No matching system was found in SUSE Multi-Linux Manager."
      />
    </div>

    <template v-else>
      <!-- System Status banner -->
      <section class="card status-card">
        <header class="card-header">
          <h3>System Status</h3>
        </header>
        <div class="card-body status-body">
          <div class="status-line" v-if="totalPatches > 0 || rebootRequired">
            <template v-if="totalPatches > 0">
              <span class="label">Software Updates Available</span>
              <a
                v-if="securityPatches > 0"
                class="stat"
                :href="errataListUrl || undefined"
                :target="errataListUrl ? '_blank' : undefined"
              >Security: {{ securityPatches }}</a>
              <a
                class="stat"
                :href="upgradablePackagesUrl || undefined"
                :target="upgradablePackagesUrl ? '_blank' : undefined"
              >Packages: {{ totalPatches }}</a>
            </template>
            <a
              v-if="rebootRequired"
              class="reboot-note"
              role="button"
              @click.prevent="openRebootDialog"
            >
              <i class="icon icon-refresh status-icon" />
              The system requires a reboot
            </a>
          </div>
          <div class="status-line" v-if="totalPatches === 0 && !rebootRequired">
            <i class="icon icon-checkmark status-icon ok" />
            <span>System is up to date</span>
          </div>
        </div>
      </section>

      <div class="grid">
        <!-- Left column -->
        <div class="col">
          <section class="card">
            <header class="card-header">
              <h3>System Info</h3>
            </header>
            <div class="card-body">
              <dl class="info-list">
                <dt>Hostname:</dt>
                <dd>{{ system.hostname || '—' }}</dd>

                <dt>IP Address:</dt>
                <dd>{{ system.network && system.network.ip || '—' }}</dd>

                <dt>IPv6 Address:</dt>
                <dd>{{ system.network && system.network.ip6 || '—' }}</dd>

                <dt>Minion Id:</dt>
                <dd>{{ system.minion_id || '—' }}</dd>

                <dt>Virtualization:</dt>
                <dd>{{ system.virtualization || '—' }}</dd>

                <dt>Virtualization Host:</dt>
                <dd>{{ virtualizationHost }}</dd>

                <dt>UUID:</dt>
                <dd>{{ system.machine_id || '—' }}</dd>

                <dt v-if="kernelLabel">Kernel:</dt>
                <dd v-if="kernelLabel">{{ kernelLabel }}</dd>

                <dt>SUSE Multi-Linux Manager System ID:</dt>
                <dd>{{ system.id }}</dd>

                <dt v-if="installedProductsLabel">Installed Products:</dt>
                <dd v-if="installedProductsLabel">{{ installedProductsLabel }}</dd>
              </dl>
            </div>
          </section>

          <section class="card" v-if="baseChannelLabel || childChannelLabels.length">
            <header class="card-header">
              <h3>Subscribed Channels</h3>
            </header>
            <div class="card-body">
              <div v-if="baseChannelLabel" class="channel-group">
                <h4>Base Channel</h4>
                <ul>
                  <li>{{ baseChannelLabel }}</li>
                </ul>
              </div>
              <div v-if="childChannelLabels.length" class="channel-group">
                <h4>Child Channels</h4>
                <ul>
                  <li v-for="label in childChannelLabels" :key="label">{{ label }}</li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        <!-- Right column -->
        <div class="col">
          <section class="card">
            <header class="card-header">
              <h3>System Events</h3>
            </header>
            <div class="card-body">
              <dl class="info-list">
                <dt v-if="formattedCheckedIn">Checked In:</dt>
                <dd v-if="formattedCheckedIn">{{ formattedCheckedIn }}</dd>

                <dt v-if="formattedRegistered">Registered:</dt>
                <dd v-if="formattedRegistered">{{ formattedRegistered }}</dd>

                <dt v-if="formattedLastBoot">Last Booted:</dt>
                <dd v-if="formattedLastBoot">{{ formattedLastBoot }}</dd>
              </dl>
            </div>
          </section>

          <section class="card">
            <header class="card-header">
              <h3>System Properties</h3>
            </header>
            <div class="card-body">
              <dl class="info-list">
                <dt v-if="systemTypesLabel">System Types:</dt>
                <dd v-if="systemTypesLabel">{{ systemTypesLabel }}</dd>

                <dt v-if="system.contact_method">Contact Method:</dt>
                <dd v-if="system.contact_method">{{ system.contact_method }}</dd>

                <dt v-if="autoPatchUpdateLabel">Auto Patch Update:</dt>
                <dd v-if="autoPatchUpdateLabel">{{ autoPatchUpdateLabel }}</dd>

                <dt>System Name:</dt>
                <dd>{{ system.profile_name || system.clusterGroup || '—' }}</dd>

                <dt v-if="system.description">Description:</dt>
                <dd v-if="system.description">{{ system.description }}</dd>

                <dt v-if="locationLabel">Location:</dt>
                <dd v-if="locationLabel">{{ locationLabel }}</dd>

                <dt>Lock Status:</dt>
                <dd>{{ system.lock_status ? 'Locked' : 'Unlocked' }}</dd>
              </dl>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
  .suma-server-info {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .card {
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    background: var(--body-bg);
    overflow: hidden;
  }

  .card-header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);

    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
  }

  .card-body {
    padding: 12px 16px;
  }

  .status-card .card-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .status-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;

    .status-icon {
      &.updates {
        color: var(--error);
      }

      &.ok {
        color: var(--success);
      }
    }

    .label {
      margin-right: 4px;
    }

    .stat {
      color: var(--link);
      cursor: pointer;
      margin-right: 12px;

      &:hover {
        text-decoration: underline;
      }
    }

    .reboot-note {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--link);
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  .info-list {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 16px;
    row-gap: 6px;
    margin: 0;

    dt {
      color: var(--muted, var(--input-label));
      font-weight: 400;
      white-space: nowrap;
    }

    dd {
      margin: 0;
      word-break: break-word;
    }
  }

  .channel-group {
    & + .channel-group {
      margin-top: 12px;
    }

    h4 {
      margin: 0 0 4px 0;
      font-size: 13px;
      font-weight: 600;
    }

    ul {
      margin: 0;
      padding-left: 20px;

      li {
        line-height: 1.5;
      }
    }
  }
</style>
