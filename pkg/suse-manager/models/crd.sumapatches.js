import Resource from '@shell/plugins/dashboard-store/resource-class';
import { sumaScheduleApplyErrata } from '../shared/api';
import { SUSE_MANAGER_NAMESPACE, SUMA_SERVER_RESOURCE_NAME } from '../shared/definitions';

export default class SumaPatches extends Resource {
  get availableActions() {
    const applyPatchAction = {
      action:     'applySinglePatch',
      enabled:    this.sumaPatchActionEnabled,
      icon:       'icon icon-play',
      label:      this.t('suma.cluster-details.table-actions.patch-os-single'),
      bulkable:   true,
      bulkAction: 'applyPatches',
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
      this.store.commit('suma/bumpPatchSelectionClear');
    }
  }

  // Called by SortableTable when multiple patches are selected and the bulk
  // action is triggered. All rows in a given patch table belong to the same
  // SUMA system, so schedule them as a single errata action with N ids —
  // SUMA's scheduleApplyErrata accepts an array of errataIds.
  async applyPatches(patches) {
    const first = patches?.[0]?.suma;

    if (!first?.suseManagerId || !first?.systemId) {
      return;
    }

    const errataIds = patches
      .map((p) => p.id)
      .filter((id) => id !== undefined && id !== null);

    if (!errataIds.length) {
      return;
    }

    await sumaScheduleApplyErrata(
      this.store,
      first.suseManagerId,
      [first.systemId],
      errataIds,
    );
    this.store.commit('suma/bumpPatchSelectionClear');
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
