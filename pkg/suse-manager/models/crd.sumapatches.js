import Resource from '@shell/plugins/dashboard-store/resource-class';
import { sumaScheduleApplyErrata } from '../shared/api';
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
    if (this.suma?.suseManagerId && this.suma?.systemId) {
      await sumaScheduleApplyErrata(
        this.store,
        this.suma.suseManagerId,
        [this.suma.systemId],
        [this.id],
      );
    }
  }

  /**
   * Disable the "Apply" row action while an in-progress SUMA action for this
   * system already mentions this advisory. Events are surfaced globally via
   * getSumaActionsInProgress; filter by sid to scope to this specific system.
   */
  get sumaPatchActionEnabled() {
    const actions = this.store.getters['suma/getSumaActionsInProgress'] || [];
    const inProgress = actions.some((action) => {
      return action?.sid === this.suma?.systemId
        && action?.name
        && action.name.includes(this.advisory_name);
    });

    return !inProgress;
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
