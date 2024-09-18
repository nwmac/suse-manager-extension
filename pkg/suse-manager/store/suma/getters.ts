export default {
  getSumaInstanceForCluster: (state: any) => (id: string) => {
    return state.clusterInstanceMap[id];
  },

  getSystem:  (state: any) => (id: string) => {
    console.error('getSystem');
    console.error(id);
    console.error(state);
    return state.systems[id];
  },

  // Get SUMA Systems for the specified SUMA instance
  // getSumaSystems: (state: any) => (id: string) => {
  //   console.error('getSumaSystems');
  //   console.error(id);
  //   console.error(state);
  //   return state.sumaInstances[id]?.sumaSystems;
  // },

  getNotifications:         (state: any) => state.notifications,
  getSumaActionsInProgress: (state: any) => {
    let events:any = [];

    state.sumaSystems.forEach((system:any) => {
      if (system.events?.length) {
        events = events.concat(system.events);
      }
    });

    return events;
  },
  areSumaActionsInProgress: (state: any) => (name: string) => {
    let inProgress = false;

    state.sumaSystems.forEach((system:any) => {
      if (system.profile_name === name && system.events?.length) {
        inProgress = true;
      }
    });

    console.error(inProgress);

    return inProgress;
  },

  getPatches: (state: any) => (name: string) => {
    return state.patches[name];
  },

  getCount: (state: any) =>  {
    return state.count;
  },

  /**
   * Get system group by id
   */
  getSystemGroup: (state: any) => (id: string) => {
    return state.systemGroups[id] || [];
  },

  /**
   * Get the loading status of a SUSE Manager System Group by id
   */
  getSystemGroupLoadingStatus: (state: any) => (id: string) => {
    return state.loadingStatus[id] || {};
  },

  /**
   * Get the pending actions for a given system group by id
   */
  getSystemGroupActions: (state: any) => (id: string) => {
    return state.actions[id] || [];
  },  
};
