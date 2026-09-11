import type { OfficeHubOverview } from '@stealth-reader/shared';
import { communityHttp, CommunityApiError } from './community-http';
import { beginCommunityWalletObservation, finishCommunityWalletObservation, markCommunityWalletObservationFailed, refreshCommunityWallet } from '../app/store/community-wallet-store';
export const officeHubApi = {
    overview: (cursor?: string,kind?: string): Promise<OfficeHubOverview> => communityHttp.get('/v1/office-hub/overview',{query:{cursor,kind}}),
    action: async (action: string, data: Record<string, unknown> = {}, requestId: string = crypto.randomUUID()): Promise<OfficeHubOverview> => {
        const assetsChanged = action === 'boss_claim' || action === 'weekly_claim';
        const observation = assetsChanged ? beginCommunityWalletObservation('mutation') : null;
        try { return await communityHttp.post('/v1/office-hub/actions', { action, ...data, requestId }, { retryAfterRefresh: false }); }
        finally {
            if (assetsChanged) { markCommunityWalletObservationFailed(observation); finishCommunityWalletObservation(observation); void refreshCommunityWallet(); }
        }
    },
};
const messages: Record<string, string> = {
        OFFICE_DISABLED: '公司工作台尚未开放，请稍后再来', OFFICE_ALREADY_CLAIMED: '这一份奖励已经领取过了', OFFICE_TICKETS_LOW: '限定券不足，可领取每日券或用社交积分兑换',
        OFFICE_EXP_LOW: '农场额度不足 100，或今天已经完成 20 抽', OFFICE_EXCHANGE_LIMIT: '需要 50 社交积分，每天最多兑换 2 张', OFFICE_RATE_LIMIT: '操作稍快或今日次数已用完，请稍后再试',
        OFFICE_NOT_OWNED: '先收集这件外观，再进行装备', OFFICE_STORY_CONSECUTIVE_LIMIT: '同一分支连续最多写 2 段，等同事接一段吧', OFFICE_BRANCH_ARCHIVED: '这个分支已归档，请选择其他节点', OFFICE_STORY_FULL: '这篇故事已达 128 段上限，可以开启新篇',
        OFFICE_ALREADY_ACTED: '本轮已经提交过，刷新即可看到结果', OFFICE_SELF_RATING: '不能给自己的续写评分', OFFICE_SELF_GUESS: '请猜其他同事的作品', OFFICE_DRAWING_EXPIRED: '绘画的 2 分钟时间已过，请领取新题', OFFICE_GUESS_LIMIT: '已猜中或本题的 5 次机会已用完',
        OFFICE_WORD_REVEALED: '描述里不能直接出现词语，请换种表达', OFFICE_SPY_PHASE: '阶段已经变化，刷新后继续', OFFICE_SPY_NOT_ACTIVE: '你尚未入局或已经出局', OFFICE_SPY_START_INVALID: '需要 3—8 位玩家，只有房主可以开始', OFFICE_SPY_JOIN_INVALID: '本局已开始、已满员或你已经加入',
        OFFICE_WEEKLY_UNAVAILABLE: '需部门累计 40 波、个人至少 2 波，每周只领奖一次', OFFICE_BOSS_UNAVAILABLE: '巡视尚未结束或今日奖励已经领取', OFFICE_BOSS_NOT_RUNNING: '巡视已经结束，或尚未开始', OFFICE_ALREADY_STARTED: '今天的巡视已经开始，可直接继续或领取',
        OFFICE_POST_NOT_FOUND: '内容已删除、隐藏或不可访问', OFFICE_SHARED_STORY: '已有同事参与续写，不能删除整篇共同故事', OFFICE_OWNER_REQUIRED: '只有内容作者或公司负责人可以操作', OFFICE_DEPARTMENT_REQUIRED: '需要加入同一公司才能参与', OFFICE_RELATIONSHIP_BLOCKED: '双方存在屏蔽关系，暂时无法互动',
        OFFICE_TEXT_INVALID: '请检查输入长度', OFFICE_IDEMPOTENCY_CONFLICT: '重复请求内容不一致，请刷新核对', SOCIAL_VERIFICATION_REQUIRED: '完成社交认证后可以创作和互动', OFFICE_MODERATOR_REQUIRED: '只有网站管理员或版主可以审核',
        OFFICE_RELIEF_DISABLED: '机会挑战暂未开放，原每日巡视仍可继续',
        OFFICE_RELIEF_VERSION_CONFLICT: '资料版本已更新，请刷新后重新核对条件',
        OFFICE_RELIEF_DAY_CHANGED: '领取时已跨北京时间零点，本次已回滚；请刷新后重新确认，礼包仍然保留',
        OFFICE_RELIEF_NO_CHANCES: '可用机会不足；每 30 分钟可信活跃时间积累一次',
        OFFICE_RELIEF_PENDING_FULL: '待领区已有 99 份物品，请先领取后再挑战',
        OFFICE_RELIEF_TOKENS_FULL: '解压币余额接近容量上限，请先到外观柜使用',
        OFFICE_RELIEF_TOKENS_LOW: '解压币不足，不会改扣你的办公币',
        OFFICE_RELIEF_SKIN_OWNED: '你已经拥有这款外观，不需要重复购买',
        OFFICE_RELIEF_SKIN_NOT_OWNED: '请先拥有这款外观，再选择使用',
        OFFICE_RELIEF_SKIN_UNCHANGED: '当前已经使用这款外观，无需重复设置',
        OFFICE_RELIEF_DROP_NOT_FOUND: '该物品已经领取或不存在，请刷新待领区',
        OFFICE_RELIEF_TOWER_REQUIRED: '请先到九层妖塔建立角色，物品仍保留在待领区',
        OFFICE_RELIEF_TOWER_BUSY: '妖塔战斗或自动探索进行中，结束后再领取；物品仍然保留',
        OFFICE_RELIEF_FARM_REQUIRED: '请先开通农场，礼包仍保留在待领区',
        OFFICE_RELIEF_REWARD_FULL: '目标材料、碎片或余额容量不足，物品仍保留在待领区',
        OFFICE_RELIEF_REQUEST_REUSED: '请求编号已经使用，请先核对原操作记录',
        OFFICE_RELIEF_ACTION_INVALID: '操作内容无效，请刷新后重新选择',
        OFFICE_RELIEF_STATE_INVALID: '压力整理资料暂时不可用，请联系站长核查',
        OFFICE_RELIEF_TIME_INVALID: '服务器时间校验未通过，请稍后再试',
        OFFICE_RELIEF_RANDOM_INVALID: '服务器结算未完成，请稍后再试',
    };
export function officeHubError(error: unknown): string {
    if (error instanceof CommunityApiError) {
        const body = error.body as {
            code?: string;
        } | null;
        return messages[body?.code ?? ''] ?? error.message;
    }
    return error instanceof Error ? error.message : '请求失败，请稍后重试';
}

/** Do not expose internal transport / validation detail in the independent game. */
export function officeBossError(error: unknown): string {
    if (error instanceof CommunityApiError) {
        const code = (error.body as { code?: string } | null)?.code;
        if (code && messages[code]) return messages[code];
        if (error.status === 401) return '登录状态已失效，请重新登录后查看记录';
        if (error.status === 429) return '操作稍快，请稍后核对';
        if (error.status >= 500) return '服务器暂时没有返回可确认的结果';
        if (error.status > 0) return '操作暂时不可用，请刷新核对';
    }
    return '网络连接中断，暂时无法确认结果';
}
