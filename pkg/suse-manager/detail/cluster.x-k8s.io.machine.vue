<script>
import createEditView from '@shell/mixins/create-edit-view';
import CruResource from '@shell/components/CruResource';
import Loading from '@shell/components/Loading';
import { LabeledInput } from '@components/Form/LabeledInput';
import { CAPI, MANAGEMENT, NORMAN } from '@shell/config/types';
import ResourceTabs from '@shell/components/form/ResourceTabs';
import Tab from '@shell/components/Tabbed/Tab';
import SortableTable from '@shell/components/SortableTable';
import { _VIEW } from '@shell/config/query-params';
import { sumaSystemForNode } from '../shared/utils';
import { SUSE_MANAGER_NAMESPACE, SUMA_SERVER_RESOURCE_NAME } from '../shared/definitions';
import SumaServerInfo from '../components/SumaServerInfo';

const SUSE_MANAGER_LINK_ANNOTATION = 'susemanager.cattle.io/link';

export default {
  components: {
    CruResource,
    Loading,
    LabeledInput,
    ResourceTabs,
    Tab,
    SortableTable,
    SumaServerInfo
  },
  mixins: [createEditView],
  props:  {
    value: {
      type:     Object,
      required: true,
    },
  },
  async fetch() {
    const clusterName = this.value.spec?.clusterName;

    if (clusterName) {
      const provCluster = await this.$store.dispatch('management/find', {
        type: CAPI.RANCHER_CLUSTER,
        id:   `${ this.value.metadata.namespace }/${ clusterName }`,
        opt:  { watch: false }
      });

      this.suseManagerLink = provCluster.metadata?.annotations?.[SUSE_MANAGER_LINK_ANNOTATION];
    }
  },

  data() {
    return {
      suseManagerLink:    false,
      viewMode:           _VIEW,
      name:               '',
      loading:            true,
      sumaPatchesHeaders: [
        {
          name:      'advisory-type',
          labelKey:  'suma.node-details.cols.advisory-type',
          value:     'severity',
          sort:      'severitySort',
          formatter: 'Severity',
        },
        {
          name:          'advisory-name',
          labelKey:      'suma.node-details.cols.advisory-name',
          value:         'advisory_name',
          sort:          'advisory_name',
          formatter:     'Link',
          formatterOpts: { urlKey: 'sumaErrataUrl' },
        },
        {
          name:     'advisory-synopsis',
          labelKey: 'suma.node-details.cols.advisory-synopsis',
          value:    'synopsis',
          sort:     'advisory_synopsis',
        },
        {
          name:     'suma-update-date',
          labelKey: 'suma.node-details.cols.advisory-update-date',
          value:    'update_date',
          sort:     'update_date:desc',
        },
      ],
      sumaEventsHeaders: [
        {
          name:  'created',
          label: 'Created',
          value: 'created_date',
          sort:  'created_date:desc',
          width: 200,
        },
        {
          name:  'status',
          label: 'Status',
          value: 'status',
          sort:  'status',
          width: 120,
        },
        {
          name:  'type',
          label: 'Type',
          value: 'action_type',
          sort:  'action_type',
          width: 200,
        },
        {
          name:  'name',
          label: 'Name',
          value: 'name',
          sort:  'name',
        },
        {
          name:  'actions',
          label: '',
          value: 'eventUrl',
          width: 40,
          align: 'center',
        },
      ],
    };
  },
  methods: {
    async save(saveCb) {
      try {
        this.value.norman.name = this.name;
        await this.value.norman.save();

        saveCb(true);

        this.done();
      } catch (error) {
        this.errors.push(error);
        saveCb(false);
      }
    },

    statusClass(status) {
      switch (status) {
      case 'Success': return 'success';
      case 'Failed': return 'failed';
      case 'Some Failures': return 'mixed';
      default: return 'neutral';
      }
    },
  },
  mounted() {
    this.name = this.value.spec.displayName;
  },
  computed: {
    doneLocationOverride() {
      return this.value.doneOverride;
    },

    sumaSystem() {
      const sumaSystems = this.$store.getters['suma/getSystemGroup'](this.suseManagerLink);

      return sumaSystemForNode(sumaSystems, this.value);
    },

    sumaPatches() {
      return this.sumaSystem?.listLatestUpgradablePackages || [];
    },

    /**
     * MLM base URL, resolved from the SumaServer resource that SumaPanel
     * already loaded. Used to deep-link event rows into the MLM UI.
     */
    mlmBaseUrl() {
      const id = this.sumaSystem?.suseManagerId;

      if (!id) {
        return '';
      }

      const server = this.$store.getters['management/byId'](SUMA_SERVER_RESOURCE_NAME, `${ SUSE_MANAGER_NAMESPACE }/${ id }`);

      return server?.spec?.url || '';
    },

    /**
     * Full event history for this system, most recent first, with a derived
     * status column based on pickup / completed dates and a per-row deep link
     * back into the MLM UI's event detail page.
     */
    sumaEvents() {
      const raw = this.sumaSystem?.allEvents || [];
      const sid = this.sumaSystem?.id;
      const base = this.mlmBaseUrl;

      return raw.map((ev) => {
        let status = 'Pending';

        if (ev.completed_date) {
          // MLM reports the per-action success/failure tallies once the action
          // has finished. Prefer those over a plain "Completed" so the row
          // reflects the real outcome; fall back to "Completed" when neither
          // count is present (older MLMs or actions with no outcome data).
          const successful = Number(ev.successful_count) || 0;
          const failed = Number(ev.failed_count) || 0;

          if (successful > 0 && failed === 0) {
            status = 'Success';
          } else if (failed > 0 && successful === 0) {
            status = 'Failed';
          } else if (successful > 0 && failed > 0) {
            status = 'Some Failures';
          } else {
            status = 'Completed';
          }
        } else if (ev.pickup_date) {
          status = 'In Progress';
        }

        const eventUrl = base && sid && ev.id
          ? `${ base }/rhn/systems/details/history/Event.do?sid=${ sid }&aid=${ ev.id }`
          : '';

        return {
          ...ev, status, eventUrl
        };
      }).sort((a, b) => {
        const at = new Date(a.created_date || 0).getTime();
        const bt = new Date(b.created_date || 0).getTime();

        return bt - at;
      });
    },

    loadingPatchList() {
      const loading = this.$store.getters['suma/getSystemGroupLoadingStatus'](this.suseManagerLink);

      if (this.sumaSystem) {
        return false;
      }

      return loading?.loading;
    }
  },
};
</script>

<template>
  <Loading v-if="!value" />
    <ResourceTabs
      :value="value"
      :mode="mode"
      :need-related="false"
      :need-events="false"
      @update:value="$emit('input', $event)"
    >
      <Tab
        v-if="mode === viewMode"
        name="suma-server"
        label-key="suma.node-details.tabs.server"
        :weight="4"
      >
        <SumaServerInfo
          :node="value"
          :system="sumaSystem"
          />
      </Tab>
      <Tab
        v-if="mode === viewMode"
        name="suma-patches"
        label-key="suma.node-details.tabs.patches"
        :weight="3"
      >
        <SortableTable
          :loading="loadingPatchList"
          :headers="sumaPatchesHeaders"
          :rows="sumaPatches"
          :table-actions="false"
          :row-actions="true"
          default-sort-by="advisory-type"
        />
      </Tab>
      <Tab
        v-if="mode === viewMode"
        name="suma-events"
        label="Events"
        :weight="2"
      >
        <SortableTable
          :loading="loadingPatchList"
          :headers="sumaEventsHeaders"
          :rows="sumaEvents"
          :table-actions="false"
          :row-actions="false"
          key-field="id"
          default-sort-by="created"
        >
          <template #cell:status="{ row }">
            <span :class="['event-status', `event-status-${ statusClass(row.status) }`]">
              {{ row.status }}
            </span>
          </template>
          <template #cell:actions="{ row }">
            <a
              v-if="row.eventUrl"
              :href="row.eventUrl"
              target="_blank"
              rel="nofollow noopener noreferrer"
              class="event-link"
              :title="'Open in SUSE Multi-Linux Manager'"
            >
              <i class="icon icon-external-link" />
            </a>
          </template>
        </SortableTable>
      </Tab>
    </ResourceTabs>
</template>

<style lang="scss" scoped>
.event-link {
  display: inline-flex;
  align-items: center;
  color: var(--link);

  &:hover {
    text-decoration: none;
    opacity: 0.8;
  }
}

.event-status {
  &-success { color: var(--success); }
  &-failed  { color: var(--error); }
  &-mixed   { color: var(--warning); }
}
</style>
