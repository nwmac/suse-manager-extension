// Constants

export const SUSE_MANAGER_LINK_ANNOTATION = 'susemanager.cattle.io/link';

// Resource name for a SUSE Manager Server
export const SUMA_SERVER_RESOURCE_NAME = 'susemanager.cattle.io.manager';

export const SUSE_MANAGER_NAMESPACE = 'suse-manager';

// Types

export type SystemGroupLoadingStatus = {
  id: string;
  loading: boolean,
  error: string,
};

export type SystemGroup = {
  id: string,
  systems: any[]
};

export type Action = {
  id: number;
};

export type SystemGroupActions = {
  id: string,
  actions: Action,
};
