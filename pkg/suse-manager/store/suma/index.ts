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
        // TODO Note needed
        clusterInstanceMap: {},
        
        sumaSystems: [], notifications: {},

        // Map of system id to system groups
        systemGroups: {},

        // Loading status of each Suse Manager system group
        loadingStatus: {},

        // Actions in progress - a map from a SUSE Manager ID to an array of action metadata
        actions: {}
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
