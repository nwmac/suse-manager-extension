import { SystemGroupActions, SystemGroup, SystemGroupLoadingStatus } from "../../shared/types";

const NOTIFICATION_TIMEOUT = 5000;

// Timeout before we clear the last notification message
var notificationTimeout: any;

export default {
  // updateSumaSystemsList(state: any, data: any) {
  //   const { sumaID, sumaInstance, sumaSystems } = data;

  //   if (!state.sumaInstances[sumaInstance]) {
  //     state.sumaInstances[sumaInstance] = {};
  //   }

  //   state.sumaInstances[sumaInstance].sumaSystems = sumaSystems;

  //   // Update the patch info as well
  //   sumaSystems.forEach((s: any) => {
  //     const ip = s.network?.ip;

  //     if (ip) {
  //       const id = `${ sumaInstance }/${ ip }`;

  //       console.log(`Storing ${ id }`);

  //       // state.systems[id] = s;
  //       state.patches[id] = 100;
  //     }
  //   });
  // },

  updateSystemEventsList(state: any, data: any) {
    const index = state.sumaSystems.findIndex((s: any) => s.id === data.sid);

    if (index >= 0) {
      const eventsInProgress = data.systemEvents.filter((ev:any) => ev.created_date && !ev.completed_date);
      const events = eventsInProgress.map((ev:any) => {
        return {
          ...ev,
          sid:          data.sid,
          profile_name: state.sumaSystems[index].profile_name
        };
      });

      state.sumaSystems[index].events = events;
    }
  },

  updateNotifications(state: any, notification: any) {
    state.notifications = notification;

    clearTimeout(notificationTimeout);
    
    notificationTimeout = setTimeout(() => {
      state.notifications = {};
    }, NOTIFICATION_TIMEOUT );
  },

  updateClusterMap(state: any, data: any) {
    state.clusterInstanceMap[data.clusterId] = data.sumaId;

    console.error(`MAPPING: ${ data.clusterId } to ${ data.sumaId }`);
  },

  updatePatchInfo(state: any, data: any) {
    const { sumaInstance, count } = data;

    state.patches[sumaInstance] = count;
  },

  /**
   * Update the list of systems for the given system group ID
   */
  updateSystemGroup(state: any, data: SystemGroup) {
    state.systemGroups = {
      ... state.systemGroups,
      [data.id]: data.systems
    };
  },

  /**
   * Update the loading status for a SUSE Manager System Group
   */
  updateLoadingStatus(state: any, data: SystemGroupLoadingStatus) {
    state.loadingStatus = {
      ... state.loadingStatus,
      [data.id]: data
    };
  },

  /**
   * Update the list of actions for the given system group ID
   */
  updateSystemGroupActions(state: any, data: SystemGroupActions) {
    state.systemGroups = {
      ... state.systemGroups,
      [data.id]: data.actions
    };
  },
};
