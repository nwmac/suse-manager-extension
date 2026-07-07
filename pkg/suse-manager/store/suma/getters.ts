export default {
  getSumaInstanceForCluster: (state: any) => (id: string) => {
    return state.clusterInstanceMap[id];
  },

  getSystem: (state: any) => (id: string) => {
    return state.systems[id];
  },

  getNotifications: (state: any) => state.notifications,

  /**
   * Flatten in-progress events across every system in every tracked system group.
   * Each event is enriched with `sid`, `suseManagerId` and `profile_name` at the point
   * it's written to state, so consumers (SumaNotification, model.sumaPatchActionEnabled)
   * can identify which SUMA instance and system it belongs to.
   */
  getSumaActionsInProgress: (state: any) => {
    let events: any[] = [];

    Object.values(state.systemGroups || {}).forEach((systems: any) => {
      (systems || []).forEach((system: any) => {
        if (system?.events?.length) {
          events = events.concat(system.events);
        }
      });
    });

    return events;
  },

  areSumaActionsInProgress: (state: any) => (name: string) => {
    let inProgress = false;

    Object.values(state.systemGroups || {}).forEach((systems: any) => {
      (systems || []).forEach((system: any) => {
        if (system?.profile_name === name && system?.events?.length) {
          inProgress = true;
        }
      });
    });

    return inProgress;
  },

  getPatches: (state: any) => (name: string) => {
    return state.patches[name];
  },

  getCount: (state: any) => {
    return state.count;
  },

  /**
   * Get system group by id
   */
  getSystemGroup: (state: any) => (id: string) => {
    return state.systemGroups[id] || [];
  },

  /**
   * Get the SUMA system group numeric id for a suseManagerLink.
   */
  getSystemGroupId: (state: any) => (id: string) => {
    return state.systemGroupIds?.[id];
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
  }
};
