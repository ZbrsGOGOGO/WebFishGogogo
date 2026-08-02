import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ActivityEvent } from '../../database/entities/activity-event.entity';

export interface RecentActivityItem {
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
  activities: RecentActivityItem[];
}

@Injectable()
export class EngagementService {
  constructor(private readonly dataSource: DataSource) {}

  async getRecentActivities(
    userId: string,
    limit = 8,
  ): Promise<RecentActivityResponse> {
    const take = Math.min(Math.max(Math.trunc(limit), 1), 20);
    const activities = await this.dataSource
      .getRepository(ActivityEvent)
      .find({
        where: { userId },
        order: { occurredAt: 'DESC', createdAt: 'DESC' },
        take,
      });

    return {
      activities: activities.map((activity) => ({
        id: activity.id,
        eventType: activity.eventType,
        title: activity.title,
        description: activity.description,
        sourceType: activity.sourceType,
        sourceId: activity.sourceId,
        localDate: activity.localDate,
        metadata: activity.metadata,
        occurredAt: activity.occurredAt.toISOString(),
      })),
    };
  }
}
