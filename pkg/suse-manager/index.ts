import { importTypes } from '@rancher/auto-import';
import {
  TableColumnLocation, PanelLocation, ActionLocation, IPlugin, ActionOpts
} from '@shell/core/types';
import { MANAGEMENT, CAPI } from '@shell/config/types';
import Vue from 'vue';
import sumaStore from './store/suma';
import { sumaScheduleApplyErrata } from './shared/api';

// Register local formatters
const components = require.context('./components/formatter', false, /[A-Z]\w+\.(vue)$/);

components.keys().forEach((fileName: any) => {
  const componentConfig = components(fileName);
  const componentName = fileName.split('/').pop().split('.')[0];

  Vue.component(componentName, componentConfig.default || componentConfig);
});

// Init the package
export default function(plugin: IPlugin, args:any) {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Built-in icon
  plugin.metadata.icon = require('./suma_icon.png');

  // create new SUMA store
  plugin.addDashboardStore(sumaStore.config.namespace, sumaStore.specifics, sumaStore.config);

  // Load a product
  plugin.addProduct(require('./product'));

  // Add a route
  plugin.addRoute({
    name: 'c-cluster-manager-suma',
    path: '/c/:cluster/manager/suma',
    component: () => import('./list/susemanager.cattle.io.manager.vue').then((m) => m.default),
  });

  // add hidden panel to retrieve data
  plugin.addPanel(
    PanelLocation.DETAILS_MASTHEAD,
    { resource: [CAPI.RANCHER_CLUSTER, MANAGEMENT.NODE], mode: ['detail'] },
    { component: () => import('./components/SumaPanel.vue') }
  );

  // add notification panel for ongoing OS patches
  plugin.addPanel(
    PanelLocation.DETAILS_MASTHEAD,
    { resource: [CAPI.RANCHER_CLUSTER, MANAGEMENT.NODE], mode: ['detail'] },
    { component: () => import('./components/SumaNotification.vue') }
  );

  // add table col on machine pools table under cluster details (number of patches available)
  plugin.addTableColumn(
    TableColumnLocation.RESOURCE,
    {
      resource: [CAPI.RANCHER_CLUSTER], mode: ['detail'], hash: ['node-pools']
    },
    {
      name:          'suma-patches',
      labelKey:      'suma.cluster-details.patches-col',
      formatter:     'PatchCount',
      formatterOpts: {
        loadingGetter: 'suma/areSumaActionsInProgress',
        urlKey:        (row: any) => {
          const detailLocation = row.detailLocation;

          return {
            ...detailLocation,
            hash: '#suma-patches',
          };
        }
      },
      dashIfEmpty: true,
      width:  100,
      sort:   ['suma-patches'],
      search: ['suma-patches'],
    }
  );

  // table action - apply all OS patches available to a particular machine
  plugin.addAction(
    ActionLocation.TABLE,
    {
      resource: [CAPI.RANCHER_CLUSTER], mode: ['detail'], hash: ['node-pools']
    },
    {
      labelKey: 'suma.cluster-details.table-actions.patch-os',
      icon:     'icon-play',
      enabled(ctx: any) {
        // const areSumaActionsInProgress = args.store.getters['suma/areSumaActionsInProgress'](ctx.nameDisplay);
        // const sumaSystems = args.store.getters['suma/getSumaSystems'];
        // const sumaSystemFound = sumaSystems.find((s: any) => s.profile_name === ctx.nameDisplay);

        // if (areSumaActionsInProgress) {
        //   return false;
        // }

        // return !!sumaSystemFound;
        console.error(ctx);
        return false;
      },
      invoke(opts: ActionOpts, values: any[]) {
        const node = values[0];
        const sumaSystems = args.store.getters['suma/getSumaSystems'];
        const sumaSystemFound = sumaSystems.find((s: any) => s.profile_name === node.nameDisplay);

        // TODO: change logic to schedule patches application all in one go
        if (sumaSystemFound && sumaSystemFound.listLatestUpgradablePackages?.length) {
          // perform OS patch apply
          sumaScheduleApplyErrata(args.store, [sumaSystemFound.id], [sumaSystemFound.listLatestUpgradablePackages[0].id]);
        }
      }
    }
  );
}
