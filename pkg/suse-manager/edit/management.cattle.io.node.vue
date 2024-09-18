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
    // we need this to populate the NORMAN node... getNorman
    await this.$store.dispatch('rancher/findAll', { type: NORMAN.NODE });

    console.log(this.value);
    console.log(this.value.mgmtClusterId);

    // For the SUMA Patches
    const mgmtCluster = await this.$store.dispatch('management/find', {
      type: MANAGEMENT.CLUSTER,
      id:   this.value.mgmtClusterId,
      opt:  { watch: false }
    });

    const provCluster = await this.$store.dispatch('management/find', {
      type: CAPI.RANCHER_CLUSTER,
      id:   mgmtCluster.provClusterId,
      opt:  { watch: false }
    });

    const suseManagerLink = provCluster.metadata?.annotations?.[SUSE_MANAGER_LINK_ANNOTATION];

    console.error('NODE');
    console.error(suseManagerLink);
    this.suseManagerLink = suseManagerLink;
  },
  data() {
    return {
      suseManagerLink:    false,
      viewMode:           _VIEW,
      name:                '',
      loading:             true,
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
        // {
        //   name:     'status',
        //   labelKey: 'suma.node-details.cols.advisory-status',
        //   value:    'status',
        //   sort:     'status',
        // },
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
      const sumaSystem = sumaSystemForNode(sumaSystems, this.value);

      console.error(sumaSystem);

      return sumaSystem;
    },

    sumaPatches() {
      console.log(this);

      const sumaSystems = this.$store.getters['suma/getSystemGroup'](this.suseManagerLink);

      console.log(sumaSystems);

      const sumaSystem = sumaSystemForNode(sumaSystems, this.value);

      console.error(sumaSystem);

      // const sumaSystems = this.$store.getters['suma/getSumaSystems'];
      // const currSystem = sumaSystems.find(g => g?.profile_name === this.value.nameDisplay);
      // let sumaPatches = [];

      // if (currSystem) {
      //   sumaPatches = currSystem.listLatestUpgradablePackages;
      // }

      // return sumaPatches;
      return sumaSystem?.listLatestUpgradablePackages || [];
    },

    loadingPatchList() {
      const loading = this.$store.getters['suma/getSystemGroupLoadingStatus'](this.suseManagerLink);
      const sumaSystems = this.$store.getters['suma/getSystemGroup'](this.suseManagerLink);
      const sumaSystem = sumaSystemForNode(sumaSystems, this.value);

      if (sumaSystem) {
        return false;
      }

      return loading?.loading;
    }
  },
};
</script>

<template>
  <Loading v-if="!value" />
  <CruResource
    v-else
    :resource="value"
    :mode="mode"
    :errors="errors"
    @finish="save"
  >
    <ResourceTabs
      v-model="value"
      :need-related="false"
      :need-events="false"
    >
      <Tab
        name="node-edit"
        label-key="suma.node-details.tabs.node"
        :weight="4"
      >
        <LabeledInput
          v-model="name"
          :label="t('managementNode.customName')"
          :mode="mode"
        />
      </Tab>
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
    </ResourceTabs>
  </CruResource>
</template>
