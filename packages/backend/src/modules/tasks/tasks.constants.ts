export const TASKS_CLOCK = Symbol('TASKS_CLOCK');

export interface TasksClock {
  now(): Date;
}

export const systemTasksClock: TasksClock = {
  now: () => new Date(),
};

export const DAILY_TASK_REWARD_RULE_KEY = 'daily_task_reward_v1';
