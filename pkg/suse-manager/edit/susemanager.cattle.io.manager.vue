<script>
import CreateEditView from '@shell/mixins/create-edit-view';
import Footer from '@shell/components/form/Footer';
import NameNsDescription from '@shell/components/form/NameNsDescription';
import { LabeledInput } from '@components/Form/LabeledInput';
import Checkbox from '@components/Form/Checkbox/Checkbox.vue';
import { SECRET } from '@shell/config/types';
import { SUSE_MANAGER_NAMESPACE } from '../shared/definitions';
import { pingProxy, getProxyService } from '../shared/api';

export default {
  name: 'SuseManagerCreate',

  components: {
    Checkbox,
    Footer,
    LabeledInput,
    NameNsDescription,
  },

  mixins: [ CreateEditView ],

  async fetch() {
    console.error('FETCH');

    if (this.value.passwordSecret) {
      // Get the password secret
      this.secret = await this.$store.dispatch('management/find', {
        type: SECRET,
        id:   `${this.value.namespace}/${ this.value.passwordSecret }`,
      });
    }

    console.error(this.secret);
  },

  data() {
    console.log(this);
    console.log(this.value);

    return {
      errors: undefined,
      url: '',
      password: '',
      secret: undefined,
    };
  },

  created() {
    // TODO: This should be async?
    this.registerBeforeHook(this.createOrUpdatePasswordSecret);
  },

  methods: {
    saveTest() {
      console.error(this);
      console.error(this.value);

      this.save();
    },

    async testConnection() {
      console.error('TEST CONNECTION');
      // Check to see if the service is available
      const service = await getProxyService(this.$store);

      if (service) {
        // Service is there, now check that we can ping it
        const ping = await pingProxy(this.$store);

        console.error(ping);
      }
    },

    // Save the secret for the password
    async createOrUpdatePasswordSecret() {
      // If the secret does not have a name, then this is create
      if (!this.secret) {
        // Create a new secret
        this.secret = await this.$store.dispatch(`management/create`, {
          type: SECRET,
          metadata: {
            name: `${ this.value.name }-password`,
            namespace: SUSE_MANAGER_NAMESPACE
          },
          data: {}
        });

        this.value.passwordSecret = this.secret.name;
      }

      this.secret.data.password = btoa(this.password);

      // Only update if the password was set
      if (this.password) {
        await this.secret.save();
      }
    }
  }
};
</script>
<template>
  <div>
    <form>
      <NameNsDescription
        :value="value"
        :mode="mode"
        :namespaced="false"
        @update:value="$emit('input', $event)"
      />
      <div class="row mb-20">
        <div class="col span-9">

        <LabeledInput
          label="SUSE Manager URL"
          v-model:value="value.url"
          :required="true"
          :mode="mode"
        />
      </div>
    </div>
    <div class="row mb-20">
      <div class="col span-9 checkbox">
        <Checkbox
          v-model:value="value.insecure"
          :mode="mode"
          label="Allow insecure TLS"
          data-testid="aks-monitoring-checkbox"
        />
        <span>Allow insecure TLS (for example when testing with self-signed certificates)</span>
      </div>
    </div>
    <div class="mb-10">Credentials</div>
      <div class="row mb-20">
        <div class="col span-4">
          <LabeledInput
          label="Username"
          v-model:value="value.username"
          :required="true"
          :mode="mode"
          />
        </div>
        <div class="col span-4">
          <LabeledInput
            label="Password"
            v-model:value="password"
            :required="true"
            :mode="mode"
          />
          <div
            v-if="mode === 'edit'"
            class="pwd-note"
          >
            Leave password blank to keep existing password
          </div>
        </div>
      </div>

      <div
        v-if="mode == 'view'"
      >
        <button class="mt-20 btn role-primary" @click.prevent="testConnection">Test Connection</button>
      </div>

      <Footer
        :mode="mode"
        :errors="errors"
        @save="saveTest"
        @done="done"
      ></Footer>
    </form>
  </div>
</template>
<style lang="scss" scoped>
  .pwd-note {
    padding: 5px 0;
    font-size: 12px;
    opacity: 0.7;
  }

  .checkbox {
    display: flex;
    flex-direction: column;

    > span {
      margin-left: 20px;
      margin-top: 5px;
      opacity: 0.7;    
    }
  }
</style>