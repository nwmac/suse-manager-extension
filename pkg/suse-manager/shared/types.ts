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
