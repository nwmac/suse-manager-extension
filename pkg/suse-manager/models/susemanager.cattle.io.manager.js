import SteveModel from '@shell/plugins/steve/steve-class';

//constructor(data, ctx, rehydrateNamespace = null, setClone = false) {

export default class SuseManager extends SteveModel {

  get url() {
    return this.spec?.url;
  }

  set url(value) {
    this.spec = this.spec || {};
    this.spec.url = value;
  }

  get insecure() {
    return this.spec?.insecure;
  }

  set insecure(value) {
    this.spec = this.spec || {};
    this.spec.insecure = value;
  }

  get username() {
    return this.spec?.username;
  }

  set username(value) {
    this.spec = this.spec || {};
    this.spec.username = value;
  }

  get passwordSecret() {
    return this.spec?.passwordSecret;
  }

  set passwordSecret(value) {
    this.spec = this.spec || {};
    this.spec.passwordSecret = value;
  }

};

