import { listMyArtifacts, getArtifact } from '../api/artifactsApi.js';

export const artifactKeys = {
  all: ['artifacts'],
  list: () => ['artifacts', 'list'],
  detail: (id) => ['artifacts', 'detail', id],
};

export function artifactListQueryOptions() {
  return { queryKey: artifactKeys.list(), queryFn: () => listMyArtifacts() };
}

export function artifactDetailQueryOptions(id) {
  return {
    queryKey: artifactKeys.detail(id),
    queryFn: () => getArtifact(id),
    enabled: Boolean(id),
  };
}
