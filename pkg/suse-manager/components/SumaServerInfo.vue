<script>
import Banner from '@components/Banner/Banner.vue';
import { SUSE_MANAGER_NAMESPACE, SUMA_SERVER_RESOURCE_NAME } from '../shared/definitions';

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

    // Base URL of the MLM server this system is managed by
    sumaURL() {
      const id = this.system?.suseManagerId;
      const mlm = id ? this.$store.getters['management/byId'](SUMA_SERVER_RESOURCE_NAME, `${ SUSE_MANAGER_NAMESPACE }/${ id }`) : undefined;

      return mlm?.spec?.url;
    },

    baseChannel() {
      const c = this.system?.baseChannel;

      return c ? this.channelInfo(c) : null;
    },

    childChannels() {
      return (this.system?.childChannels || []).map(this.channelInfo).filter((c) => c.label);
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
    // Label for a subscribed channel, with a link to its page in MLM (when we know the channel id and MLM URL)
    openRebootDialog() {
      if (!this.system?.suseManagerId || !this.system?.id) {
        return;
      }

      this.$store.dispatch('management/promptModal', {
        componentProps: {
          sid:           this.system.id,
          suseManagerId: this.system.suseManagerId,
          systemName:    this.system.profile_name || this.system.hostname || '',
        },
        component:  'SuseManagerRebootDialog',
        modalWidth: '450px',
      });
    },

    channelInfo(c) {
      return {
        label: c.label || c.name,
        url:   this.sumaURL && c.id ? `${ this.sumaURL }/rhn/channels/ChannelDetail.do?cid=${ c.id }` : undefined,
      };
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

          <section class="card" v-if="baseChannel || childChannels.length">
            <header class="card-header">
              <h3>Subscribed Channels</h3>
            </header>
            <div class="card-body">
              <div v-if="baseChannel" class="channel-group">
                <h4>Base Channel</h4>
                <ul>
                  <li>
                    <a v-if="baseChannel.url" :href="baseChannel.url" target="_blank" rel="noopener noreferrer">{{ baseChannel.label }}</a>
                    <template v-else>{{ baseChannel.label }}</template>
                  </li>
                </ul>
              </div>
              <div v-if="childChannels.length" class="channel-group">
                <h4>Child Channels</h4>
                <ul>
                  <li v-for="c in childChannels" :key="c.label">
                    <a v-if="c.url" :href="c.url" target="_blank" rel="noopener noreferrer">{{ c.label }}</a>
                    <template v-else>{{ c.label }}</template>
                  </li>
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

                <dt>Last Booted:</dt>
                <dd>{{ formattedLastBoot || '—' }}</dd>
              </dl>
              <div
                v-if="system.reboot_required"
                class="reboot-required"
              >
                <i class="icon icon-warning text-warning" />
                <span>This system requires a reboot</span>
              </div>
              <div class="reboot-actions">
                <button
                  class="btn btn-sm role-secondary"
                  @click="openRebootDialog"
                >
                  Reboot
                </button>
              </div>
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
  .reboot-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }

  .reboot-required {
    align-items: center;
    display: flex;
    margin-top: 10px;

    > i {
      margin-right: 8px;
    }
  }

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
