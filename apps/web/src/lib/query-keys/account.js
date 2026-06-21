export const accountKeys = {
  all: ['account'],
  profile: (userId) => [...accountKeys.all, 'profile', userId],
  settings: (userId) => [...accountKeys.all, 'settings', userId],
};
