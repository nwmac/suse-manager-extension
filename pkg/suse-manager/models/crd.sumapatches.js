import Resource from '@shell/plugins/dashboard-store/resource-class';
import { sumaScheduleApplyErrata, getSuseManagerConfig } from '../shared/api';
import { SUSE_MANAGER_NAMESPACE, SUMA_SERVER_RESOURCE_NAME } from '../shared/definitions';

export default class SumaPatches extends Resource {
  get availableActions() {
    const applyPatchAction = {
      action:  'applySinglePatch',
      enabled: this.sumaPatchActionEnabled,
      icon:    'icon icon-play',
      label:   this.t('suma.cluster-details.table-actions.patch-os-single')
    };

    return [applyPatchAction];
  }

  async applySinglePatch() {
    let sumaSystemFound;

    console.error(this);
    console.error(this.suma?.suseManagerId);

    const id = `${ SUSE_MANAGER_NAMESPACE }/${ this.suma?.suseManagerId }`;

    const mlmInstance = this.$rootGetters['management/byId'](SUMA_SERVER_RESOURCE_NAME, id);

    console.error(mlmInstance);

    return;

    if (this.suma) {
      console.error('applySinglePatch');
      console.error(this.suma.suseManagerId);
      sumaScheduleApplyErrata(this.store, this.suma.suseManagerId, [this.suma.systemId], [this.id]);
    }

    // const sumaSystems = this.store.getters['suma/getSumaSystems'];

    // sumaSystems.forEach((system) => {
    //   if (system.listLatestUpgradablePackages?.length) {
    //     system.listLatestUpgradablePackages.forEach((pkg) => {
    //       if (pkg.id === this.id) {
    //         sumaSystemFound = system;
    //       }
    //     });
    //   }
    // });

    // if (sumaSystemFound) {
    //   
    // }
  }

  get sumaPatchActionEnabled() {
    return true;
  }

  get __sumaPatchActionEnabled() {
    let sumaSystemFound;
    let actionFound;
    console.error('SUMA PATCHES');
    console.error(this);

    const sumaSystems = this.store.getters['suma/getSumaSystems'];
    const sumaActionsInProgress = this.store.getters['suma/getSumaActionsInProgress'];

    sumaSystems.forEach((system) => {
      if (system.listLatestUpgradablePackages?.length) {
        system.listLatestUpgradablePackages.forEach((pkg) => {
          if (pkg.id === this.id) {
            sumaSystemFound = system;
          }
        });
      }
    });

    if (sumaSystemFound) {
      sumaActionsInProgress.forEach((action) => {
        if (action.name && action.name.includes(this.advisory_name)) {
          actionFound = true;
        }
      });

      return !actionFound;
    }

    return true;
  }

  get status() {
    if (!this.sumaPatchActionEnabled) {
      return this.t('suma.patch-status-updating');
    }

    return this.advisory_status;
  }

  get sumaURL() {
    const id = `${ SUSE_MANAGER_NAMESPACE }/${ this.suma?.suseManagerId }`;
    const mlmInstance = this.$rootGetters['management/byId'](SUMA_SERVER_RESOURCE_NAME, id);

    if (mlmInstance) {
      return mlmInstance.spec.url;
    }

    return undefined;
  }

  get sumaErrataUrl() {
    return `${ this.sumaURL }/rhn/errata/details/Details.do?eid=${ this.id }`;
  }
}
