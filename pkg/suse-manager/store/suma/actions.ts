import { allHash } from '@shell/utils/promise';
import {
  sumaListAllGroups,
  sumaListGroupSystems,
  sumaGetSystemsInSystemGroup,
  sumaListSystemEvents,
  sumaListLatestUpgradablePackages,
} from '../../shared/api';
import SumaPatches from '../../models/crd.sumapatches';

import { processError, processPatch, sumaSystemForNode } from '../../shared/utils';

async function updateSumaSystemPayload(ctx: any, store: any, suseManagerId: string, sumaGroup: string, sumaSystem: any, fetchSumaEvents = true) {
  const reqs: any = { sumaPackages: await sumaListLatestUpgradablePackages(store, suseManagerId, sumaSystem?.id) };

  if (fetchSumaEvents) {
    reqs.sumaEvents = await sumaListSystemEvents(store, suseManagerId, sumaSystem?.id);
  }

  const res: any = await allHash(reqs);

  const sumaPackages = res.sumaPackages;
  const sumaEvents = res.sumaEvents || [];
  const updatedSumaSystem = { ...sumaSystem };

  // update packages (patches) payload with complimentary data needed for classify
  const updatedSumaPackages = sumaPackages.map((pkg: any) => {
    const updatedPkg = {
      ...pkg,
      metadata:      { name: `${ pkg.id }` },
      type:          'crd.sumapatches',
      kind:          'crd.sumapatches',
      suma:          {
        suseManagerId,
        systemId: sumaSystem.id,
        sumaGroup,
        sumaSystem,
      },
      store, // passing the store is needed for the API calls and data update on the SUMA store
    };

    console.error('Processing PATCH');

    processPatch(updatedPkg);

    // classify Suma Patches (we need it for available actions)
    const classifiedPkg = new SumaPatches(updatedPkg, {
      rootState:   ctx.rootState,
      rootGetters: ctx.rootGetters,
    });

    return classifiedPkg;
  });

  updatedSumaSystem.listLatestUpgradablePackages = updatedSumaPackages;
  updatedSumaSystem.clusterGroup = sumaGroup.name;

  // get only ongoing system events
  const eventsInProgress = sumaEvents.filter((ev: any) => ev.created_date && !ev.completed_date);
  const events = eventsInProgress.map((ev: any) => {
    return {
      ...ev,
      sid:          sumaSystem.id,
      profile_name: sumaSystem.profile_name
    };
  });

  updatedSumaSystem.events = events || [];

  return updatedSumaSystem;
}

export default {
  setCount(ctx: any, data: any) {
    ctx.commit('setCount', data);
  },

  async fetchSumaSystemsList(ctx: any, data: any) {
    let sumaSystems = [];
    let sumaGroupFound;
    const sumaInfo = data.suseManagerLink.split('/');
    const sumaInstance = sumaInfo[0];
    const groupName = sumaInfo.length === 2 ? sumaInfo[1] : data.clusterName;

    console.error(this);
    console.error(ctx);

    try {
      const sumaGroups = await sumaListAllGroups(data.store, data.suseManagerLink);

      sumaGroupFound = sumaGroups.find((g: any) => g.name === groupName);
    } catch (e) {
      ctx.commit('updateLoadingStatus', {
        id:      data.suseManagerLink,
        loading: false,
        error:   processError(e, ctx.rootGetters['i18n/t']),
      });

      return;
    }

    // Set loading status
    ctx.commit('updateLoadingStatus', {
      id:      data.suseManagerLink,
      loading: true,
      error:   undefined,
    });

    try {
      // get SUMA info for a group of systems in a cluster (GROUP NAME in SUMA must match CLUSTER NAME in Rancher!!!)
      if (groupName) {
        if (sumaGroupFound && sumaGroupFound['system_count']) {
          sumaSystems = await sumaGetSystemsInSystemGroup(data.store, sumaInstance, sumaGroupFound.name);

          if (data.node) {
            const sumaSystem = sumaSystemForNode(sumaSystems, data.node);

            if (sumaSystem) {
              const index = sumaSystems.findIndex((g: any) => g === sumaSystem);

              sumaSystems[index] = await updateSumaSystemPayload(ctx, data.store, sumaInstance, sumaGroupFound, sumaSystems[index]);
            }
          // update SUMA info for all systems
          } else {
            for (let x = 0; x < sumaSystems.length; x++) {
              sumaSystems[x] = await updateSumaSystemPayload(ctx, data.store, sumaInstance, sumaGroupFound, sumaSystems[x]);
            }
          }
        }

        ctx.commit('updateSystemGroup', {
          id:      data.suseManagerLink,
          systems: sumaSystems,
        });
      }

      ctx.commit('updateLoadingStatus', {
        id:      data.suseManagerLink,
        loading: false,
        error:   undefined,
      });
    } catch (e) {
      ctx.commit('updateLoadingStatus', {
        id:      data.suseManagerLink,
        loading: false,
        error:   processError(e, ctx.rootGetters['i18n/t']),
      });
    }
  },

  async updateSystemEventsList(ctx: any, data: any) {
    const systemEvents = await sumaListSystemEvents(data.store, data.sid);

    ctx.commit('updateSystemEventsList', {
      sid: data.sid,
      systemEvents
    });
  },

  updateNotifications(ctx: any, notification: any) {
    ctx.commit('updateNotifications', notification);
  },

  updateClusterMap(ctx: any, data: any) {
    ctx.commit('updateClusterMap', data);
  },

  /**
   * Update the list of systems for the given system group ID
   */
  updateSystemGroup(ctx: any, data: any) {
    ctx.commit('updateSystemGroup', data);
  }  
};
