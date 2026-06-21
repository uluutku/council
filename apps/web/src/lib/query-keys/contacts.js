export const contactKeys = {
  all: ['contacts'],
  list: () => [...contactKeys.all, 'list'],
  requests: () => [...contactKeys.all, 'requests'],
  blocked: () => [...contactKeys.all, 'blocked'],
  search: (query) => [...contactKeys.all, 'search', query],
};
