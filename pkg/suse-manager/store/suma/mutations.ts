import { SystemGroupActions, SystemGroup, SystemGroupLoadingStatus } from '../../shared/definitions';
import { isPatchRelevantAction } from '../../shared/utils';

const NOTIFICATION_TIMEOUT = 5000;

// Timeout before we clear the last notification message
var notificationTimeout: any;

export default {
  /**
   * Replace the `events` array on the system whose id matches `data.sid` inside
   * whichever system group contains it. Events are pre-filtered to those still
   * in-progress and enriched with sid / suseManagerId / profile_name so the
   * notification panel and per-patch getters can find the owning MLM instance.
   */
  updateSystemEventsList(state: any, data: any) {
    const { sid, systemEvents, suseManagerId } = data;
    const eventsInProgress = (systemEvents || []).filter((ev: any) => ev.created_date && !ev.completed_date && isPatchRelevantAction(ev));

    const nextGroups = { ...state.systemGroups };
    let updated = false;

    Object.keys(nextGroups).forEach((groupKey) => {
      const systems = nextGroups[groupKey] || [];
      const idx = systems.findIndex((s: any) => s.id === sid);

      if (idx < 0) {
        return;
      }

      const system = systems[idx];
      const events = eventsInProgress.map((ev: any) => ({
        ...ev,
        sid,
        suseManagerId: suseManagerId || system?.suseManagerId,
        profile_name:  system.profile_name,
      }));

      const newSystems = [...systems];

      newSystems[idx] = { ...system, events };
      nextGroups[groupKey] = newSystems;
      updated = true;
    });

    if (updated) {
      state.systemGroups = nextGroups;
    }
  },

  bumpPatchSelectionClear(state: any) {
    state.patchSelectionClearTick = (state.patchSelectionClearTick || 0) + 1;
  },

  updateNotifications(state: any, notification: any) {
    state.notifications = notification;

    clearTimeout(notificationTimeout);

    notificationTimeout = setTimeout(() => {
      state.notifications = {};
    }, notification?.duration || NOTIFICATION_TIMEOUT);
  },

  updateClusterMap(state: any, data: any) {
    state.clusterInstanceMap[data.clusterId] = data.sumaId;
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
      ...state.systemGroups,
      [data.id]: data.systems
    };
  },

  /**
   * Record the SUMA system group id for a suseManagerLink so we can link out
   * to the MLM UI's group detail page.
   */
  updateSystemGroupId(state: any, data: { id: string; groupId: number | string }) {
    state.systemGroupIds = {
      ...state.systemGroupIds,
      [data.id]: data.groupId,
    };
  },

  /**
   * Update the loading status for a SUSE Manager System Group
   */
  updateLoadingStatus(state: any, data: SystemGroupLoadingStatus) {
    state.loadingStatus = {
      ...state.loadingStatus,
      [data.id]: data
    };
  },

  /**
   * Update the list of actions for the given system group ID
   */
  updateSystemGroupActions(state: any, data: SystemGroupActions) {
    state.systemGroups = {
      ...state.systemGroups,
      [data.id]: data.actions
    };
  }
};
