<script>
export default {
  name: 'SuseManagerREfresh',

  mounted() {
    console.log('!');

    this.$router.replace({
      name: 'c-cluster-product-resource',
      params: {
        cluster: '_',
        product: 'manager',
        resource: 'susemanager.cattle.io.manager'
      }
    })
  }
};
</script>
<template>
</template>