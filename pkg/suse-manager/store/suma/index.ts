import { CoreStoreSpecifics, CoreStoreConfig } from '@shell/core/types';

import getters from './getters';
import mutations from './mutations';
import actions from './actions';

const sumaFactory = (): CoreStoreSpecifics => {
  return {
    state() {
      return {
        // Map of SUSE Manager Server to data for that server
        // sumaInstances: {},

        // Map of cluster IDs to SUMA Instance name
        // TODO Note needed
        clusterInstanceMap: {},

        sumaSystems: [], notifications: {},

        // Map of system id to system groups
        systemGroups: {},

        // Map of suseManagerLink → SUMA system group id (used to link to the
        // MLM UI's group detail page)
        systemGroupIds: {},

        // Loading status of each Suse Manager system group
        loadingStatus: {},

        // Actions in progress - a map from a SUSE Manager ID to an array of action metadata
        actions: {},

        // Monotonic counter bumped after a patch apply completes; patch tables
        // watch this so they can clear their selection once patches have been
        // scheduled without needing a direct component ref from the resource layer.
        patchSelectionClearTick: 0,

        // Map of SUMA action id → number of patches (errata) that action applies. Recorded when
        // we schedule patches, since SUMA's action names are truncated and can't be relied upon
        patchCounts: {},
      };
    },

    getters: { ...getters },

    mutations: { ...mutations },

    actions: { ...actions },
  };
};

const config: CoreStoreConfig = { namespace: 'suma' };

export default {
  specifics: sumaFactory(),
  config
};
