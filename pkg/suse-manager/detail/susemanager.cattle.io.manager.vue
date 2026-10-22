<script>
import Loading from '@shell/components/Loading';
import SortableTable from '@shell/components/SortableTable';
import Banner from '@components/Banner/Banner.vue';
import { CAPI } from '@shell/config/types';
import { SUSE_MANAGER_LINK_ANNOTATION } from '../shared/definitions';
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
      clusters:     [],
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
      // Provisioning clusters - used to link system groups to the clusters linked to them
      this.$store.dispatch('management/findAll', { type: CAPI.RANCHER_CLUSTER }).then((c) => {
        this.clusters = c || [];
      }).catch(() => { /* No access to clusters - groups are just not linked */ }),
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

    // Map of system group name to the clusters linked to it on this MLM server
    // (the link annotation on a provisioning cluster is `<mlm name>/<group name>`)
    clustersByGroup() {
      const id = this.value?.metadata?.name;
      const map = {};

      this.clusters.forEach((c) => {
        const [mlm, group] = (c.metadata?.annotations?.[SUSE_MANAGER_LINK_ANNOTATION] || '').split('/');

        if (mlm === id && group) {
          (map[group] = map[group] || []).push(c);
        }
      });

      return map;
    },

    groupRows() {
      return this.groups.map((g) => ({
        ...g,
        _key:     `${ g.id }`,
        clusters: this.clustersByGroup[g.name] || [],
      })).map((g) => ({
        ...g,
        clusterNames: g.clusters.map((c) => c.nameDisplay).join(', '),
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
          name:  'clusters',
          label: 'Linked Cluster',
          value: 'clusterNames',
          sort:  ['clusterNames'],
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
        >{{ serverUrl }} <i class="icon icon-external-link external" /></a>
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
    >
      <template #cell:name="{ row }">
        <a
          v-if="serverUrl"
          :href="`${ serverUrl }/rhn/groups/GroupDetail.do?sgid=${ row.id }`"
          target="_blank"
          rel="noopener noreferrer"
        >{{ row.name }} <i class="icon icon-external-link external" /></a>
        <span v-else>{{ row.name }}</span>
      </template>
      <template #cell:clusters="{ row }">
        <span
          v-if="!row.clusters.length"
          class="text-muted"
        >&mdash;</span>
        <template
          v-for="(c, i) in row.clusters"
          :key="c.id"
        >
          <router-link :to="c.detailLocation">
            {{ c.nameDisplay }}
          </router-link><span v-if="i < row.clusters.length - 1">, </span>
        </template>
      </template>
    </SortableTable>

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
  // External link icon shown after links that open MLM in a new tab
  .external {
    font-size: 12px;
    margin-left: 2px;
  }

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
