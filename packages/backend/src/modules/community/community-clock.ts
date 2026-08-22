export const COMMUNITY_CLOCK = Symbol('COMMUNITY_CLOCK');

export interface CommunityClock {
  now(): Date;
}

export const systemCommunityClock: CommunityClock = {
  now: () => new Date(),
};
