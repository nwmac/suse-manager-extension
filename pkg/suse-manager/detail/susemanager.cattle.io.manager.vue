<script>
import Loading from '@shell/components/Loading';
import SortableTable from '@shell/components/SortableTable';
import Banner from '@components/Banner/Banner.vue';
import {
  sumaGetVersion,
  sumaGetSystemVersion,
  sumaListAllGroups,
  sumaListSystems,
} from '../shared/api';

export default {
  name: 'SuseManagerDetail',

  components: {
    Banner,
    Loading,
    SortableTable,
  },

  props: {
    value: {
      type:     Object,
      required: true,
    },
  },

  data() {
    return {
      loadError:    undefined,
      apiVersion:   undefined,
      serverVersion: undefined,
      systemCount:  0,
      groups:       [],
      groupsError:  undefined,
      systemsError: undefined,
    };
  },

  async fetch() {
    const id = this.value?.metadata?.name;

    if (!id) {
      this.loadError = 'Unable to determine SUSE Manager resource name.';

      return;
    }

    const calls = [
      sumaGetVersion(this.$store, id).then((v) => {
        this.apiVersion = v;
      }).catch((e) => {
        this.loadError = e?.message || 'Unable to reach SUSE Multi-Linux Manager.';
      }),
      sumaGetSystemVersion(this.$store, id).then((v) => {
        this.serverVersion = v;
      }).catch(() => { /* surfaced via loadError */ }),
      sumaListSystems(this.$store, id).then((s) => {
        this.systemCount = s.length;
      }).catch((e) => {
        this.systemsError = e?.message || 'Unable to load systems.';
      }),
      sumaListAllGroups(this.$store, id).then((g) => {
        if (Array.isArray(g)) {
          this.groups = g;
        } else {
          this.groupsError = g?.message || 'Unable to load system groups.';
        }
      }).catch((e) => {
        this.groupsError = e?.message || 'Unable to load system groups.';
      }),
    ];

    await Promise.all(calls);
  },

  computed: {
    serverUrl() {
      return this.value?.spec?.url;
    },

    groupCount() {
      return this.groups.length;
    },

    groupRows() {
      return this.groups.map((g) => ({
        ...g,
        _key: `${ g.id }`,
      }));
    },

    groupHeaders() {
      return [
        {
          name:  'name',
          label: 'Name',
          value: 'name',
          sort:  ['name'],
        },
        {
          name:  'description',
          label: 'Description',
          value: 'description',
          sort:  ['description'],
        },
        {
          name:      'systems',
          label:     'Systems',
          value:     'system_count',
          sort:      ['system_count:desc'],
          formatter: 'Number',
          align:     'right',
          width:     120,
        },
      ];
    },
  },
};
</script>

<template>
  <Loading v-if="$fetchState.pending" />
  <div v-else class="suma-detail">
    <Banner
      v-if="loadError"
      color="error"
    >
      {{ loadError }}
    </Banner>

    <div class="info-grid">
      <div class="info-cell">
        <label>SUSE Manager URL</label>
        <a
          v-if="serverUrl"
          :href="serverUrl"
          target="_blank"
          rel="noopener noreferrer"
        >{{ serverUrl }}</a>
        <span v-else class="muted">—</span>
      </div>

      <div class="info-cell">
        <label>API Version</label>
        <span>{{ apiVersion || '—' }}</span>
      </div>

      <div class="info-cell">
        <label>Server Version</label>
        <span>{{ serverVersion || '—' }}</span>
      </div>

      <div class="info-cell">
        <label>System Groups</label>
        <span>{{ groupCount }}</span>
      </div>

      <div class="info-cell">
        <label>Systems</label>
        <span>{{ systemCount }}</span>
      </div>
    </div>

    <h3 class="mt-20">
      System Groups
    </h3>

    <Banner
      v-if="groupsError"
      color="error"
    >
      {{ groupsError }}
    </Banner>

    <SortableTable
      v-else
      :headers="groupHeaders"
      :rows="groupRows"
      key-field="_key"
      default-sort-by="name"
      :table-actions="false"
      :row-actions="false"
      :search="true"
      :paging="true"
    />

    <Banner
      v-if="systemsError"
      color="warning"
      class="mt-10"
    >
      {{ systemsError }}
    </Banner>
  </div>
</template>

<style lang="scss" scoped>
  .suma-detail {
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }

    .info-cell {
      display: flex;
      flex-direction: column;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      background: var(--box-bg);

      label {
        font-size: 12px;
        text-transform: uppercase;
        opacity: 0.7;
        margin-bottom: 4px;
      }

      a {
        word-break: break-all;
      }

      .muted {
        opacity: 0.6;
      }
    }
  }
</style>
