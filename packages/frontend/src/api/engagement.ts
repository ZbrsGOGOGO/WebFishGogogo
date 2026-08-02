// 每日任务与最近活动 API。

import { http } from './http';

export interface EngagementReward {
  experience?: number;
  currencies?: Record<string, number>;
  items?: Record<string, number>;
  energy?: number;
}

export type DailyTaskStatus = 'in_progress' | 'claimable' | 'claimed';

export interface DailyTask {
  key: string;
  title: string;
  description: string;
  eventType: string;
  progress: number;
  targetCount: number;
  status: DailyTaskStatus;
  reward: EngagementReward;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface TodayTasksResponse {
  serverTime: string;
  localDate: string;
  summary: {
    completedCount: number;
    totalCount: number;
    claimableCount: number;
  };
  tasks: DailyTask[];
}

export interface ClaimTaskResponse {
  taskKey: string;
  claimed: true;
  alreadyClaimed: boolean;
  reward: EngagementReward;
}

export interface RecentActivity {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  localDate: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface RecentActivityResponse {
  activities: RecentActivity[];
}

export function getTodayTasks(): Promise<TodayTasksResponse> {
  return http.get<TodayTasksResponse>('/v1/tasks/today');
}

export function claimDailyTask(
  taskKey: string,
): Promise<ClaimTaskResponse> {
  return http.post<ClaimTaskResponse>(
    `/v1/tasks/${encodeURIComponent(taskKey)}/claim`,
  );
}

export function getRecentActivity(): Promise<RecentActivityResponse> {
  return http.get<RecentActivityResponse>('/v1/activity/recent');
}

export const engagementApi = {
  getTodayTasks,
  claimTask: claimDailyTask,
  getRecentActivity,
};
