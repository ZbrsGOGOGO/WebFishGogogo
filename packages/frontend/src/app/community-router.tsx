import { lazy, Suspense, type JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { COMMUNITY_FEATURE_FLAGS } from './community-nav';
import {
  CommunityGuestOnlyRoute,
  CommunityVerificationRoute,
  RequireCommunityAccount,
  RequireCommunityModerator,
  RequireRestrictedCommunityAccount,
} from './community-route-guards';
import { CommunitySiteLayout } from '../components/layout/CommunitySiteLayout';
import {
  CommunityAccountSecurityPage,
  CommunityAccountStatusPage,
  CommunityFarmPage,
  CommunityFeedPage,
  CommunityFriendsPage,
  CommunityHomePage,
  CommunityInvitePage,
  CommunityMyProfilePage,
  CommunityNotificationsPage,
  CommunityOnboardingPage,
  CommunityPrivacySettingsPage,
  CommunityPublicProfilePage,
  CommunitySocialVerificationPage,
  CommunityUnavailablePage,
} from '../features/community';
import {
  CommunityForgotPasswordPage,
  CommunityLoginPage,
  CommunityPasswordResetUnavailablePage,
  CommunityReferralAcceptPage,
  CommunityRegisterPage,
  CommunityResetPasswordPage,
  CommunityVerifyEmailPage,
} from '../features/community-auth';
import {
  CommunityGuidelinesPage,
  CommunityPrivacyPolicyPage,
  CommunityTermsOfServicePage,
} from '../features/community-compliance';
import {
  CommunityModerationPage,
  CommunityPostDetailPage,
  CommunityPostEditorPage,
  CommunityPostsPage,
} from '../features/community-content';
import {
  CommunityChatLobbyPage,
  CommunityChatRoomPage,
} from '../features/community-chat';
import {
  CommunityNewsAdminPage,
  CommunityNewsDetailPage,
  CommunityNewsPage,
} from '../features/community-news';
import { PublicGameLayout } from '../features/games/PublicGameLayout';
import { PublicToolsPage } from '../features/tools/PublicToolsPage';

const OfficeBattlePage = lazy(() =>
  import('../features/office-battle/OfficeBattleGatewayPage').then((module) => ({
    default: module.OfficeBattleGatewayPage,
  })),
);
const PublicGamesPage = lazy(() =>
  import('../features/games/PublicGamesPage').then((module) => ({
    default: module.PublicGamesPage,
  })),
);
const SnakeGamePage = lazy(() =>
  import('../features/games/snake/SnakeGamePage').then((module) => ({ default: module.SnakeGamePage })),
);
const TetrisGamePage = lazy(() =>
  import('../features/games/tetris/TetrisGamePage').then((module) => ({ default: module.TetrisGamePage })),
);
const TankBattlePage = lazy(() =>
  import('../features/games/tank/TankBattlePage').then((module) => ({ default: module.TankBattlePage })),
);
const ThreeSumGamePage = lazy(() =>
  import('../features/games/three-sum/ThreeSumGamePage').then((module) => ({ default: module.ThreeSumGamePage })),
);

function loading(element: JSX.Element): JSX.Element {
  return <Suspense fallback={<p role="status">页面加载中…</p>}>{element}</Suspense>;
}

function NotFoundPage(): JSX.Element {
  return (
    <main className="not-found" aria-labelledby="community-not-found">
      <span className="not-found__code">404</span>
      <h1 id="community-not-found">没有找到这个页面</h1>
      <p>地址可能已经变化，或该功能尚未进入当前社区版本。</p>
      <a href="/">返回首页</a>
    </main>
  );
}

export function CommunityModeRouter(): JSX.Element {
  return (
    <Routes>
      <Route element={<CommunitySiteLayout />}>
        <Route index element={<CommunityHomePage />} />

        <Route element={<CommunityGuestOnlyRoute />}>
          <Route path="/login" element={<CommunityLoginPage />} />
          <Route
            path="/register"
            element={
              COMMUNITY_FEATURE_FLAGS.registration
                ? <CommunityRegisterPage />
                : <Navigate to="/" replace />
            }
          />
          <Route
            path="/invite/accept"
            element={
              COMMUNITY_FEATURE_FLAGS.registration && COMMUNITY_FEATURE_FLAGS.invite
                ? <CommunityReferralAcceptPage />
                : <CommunityUnavailablePage system="invite" title="邀请注册暂未开放" />
            }
          />
        </Route>
        <Route path="/password/forgot" element={COMMUNITY_FEATURE_FLAGS.passwordReset ? <CommunityForgotPasswordPage /> : <CommunityPasswordResetUnavailablePage />} />
        <Route path="/password/reset" element={COMMUNITY_FEATURE_FLAGS.passwordReset ? <CommunityResetPasswordPage /> : <CommunityPasswordResetUnavailablePage />} />
        <Route element={<CommunityVerificationRoute />}>
          <Route path="/register/verify" element={<CommunityVerifyEmailPage />} />
        </Route>

        <Route element={<RequireCommunityAccount />}>
          <Route
            path="/ledou"
            element={
              COMMUNITY_FEATURE_FLAGS.ledou
                ? loading(<OfficeBattlePage />)
                : <CommunityUnavailablePage system="ledou" />
            }
          />
          <Route path="/battle" element={<Navigate to="/ledou" replace />} />
        </Route>

        <Route element={<RequireCommunityAccount skipOnboarding />}>
          <Route path="/onboarding" element={<CommunityOnboardingPage />} />
        </Route>
        <Route element={<RequireCommunityAccount />}>
          <Route path="/me" element={<CommunityMyProfilePage />} />
          <Route path="/account/security" element={<CommunityAccountSecurityPage />} />
          <Route path="/settings/privacy" element={<CommunityPrivacySettingsPage />} />
          {COMMUNITY_FEATURE_FLAGS.socialVerification ? (
            <Route path="/settings/verification" element={<CommunitySocialVerificationPage />} />
          ) : null}
          <Route path="/notifications" element={<CommunityNotificationsPage />} />
        </Route>
        {!COMMUNITY_FEATURE_FLAGS.socialVerification ? (
          <Route element={<RequireCommunityAccount />}>
            <Route
              path="/settings/verification"
              element={<CommunityUnavailablePage system="profile" title="身份核验暂未开放" />}
            />
          </Route>
        ) : null}
        <Route element={<RequireCommunityAccount />}>
          {COMMUNITY_FEATURE_FLAGS.friends ? (
            <Route path="/friends" element={<CommunityFriendsPage />} />
          ) : <Route path="/friends" element={<CommunityUnavailablePage system="friends" />} />}
          {COMMUNITY_FEATURE_FLAGS.invite ? (
            <Route path="/invite" element={<CommunityInvitePage />} />
          ) : <Route path="/invite" element={<CommunityUnavailablePage system="invite" />} />}
          {COMMUNITY_FEATURE_FLAGS.feed ? (
            <Route path="/feed" element={<CommunityFeedPage />} />
          ) : <Route path="/feed" element={<CommunityUnavailablePage system="feed" />} />}
          {COMMUNITY_FEATURE_FLAGS.farm ? (
            <Route path="/farm" element={<CommunityFarmPage />} />
          ) : <Route path="/farm" element={<CommunityUnavailablePage system="farm" />} />}
        </Route>
        <Route element={<RequireRestrictedCommunityAccount />}>
          <Route path="/account/status" element={<CommunityAccountStatusPage />} />
        </Route>

        <Route element={<RequireCommunityAccount />}>
          {COMMUNITY_FEATURE_FLAGS.news ? (
            <>
              <Route path="/news" element={<CommunityNewsPage />} />
              <Route path="/news/:id" element={<CommunityNewsDetailPage />} />
            </>
          ) : (
            <>
              <Route path="/news" element={<CommunityUnavailablePage system="news" />} />
              <Route path="/news/*" element={<CommunityUnavailablePage system="news" />} />
            </>
          )}
          <Route
            path="/community"
            element={COMMUNITY_FEATURE_FLAGS.community
              ? <CommunityPostsPage />
              : COMMUNITY_FEATURE_FLAGS.chat
                ? <Navigate to="/community/chat" replace />
                : <CommunityUnavailablePage system="community" />}
          />
          {COMMUNITY_FEATURE_FLAGS.community ? (
            <Route path="/community/posts/:id" element={<CommunityPostDetailPage />} />
          ) : null}
          <Route
            path="/community/*"
            element={COMMUNITY_FEATURE_FLAGS.community || COMMUNITY_FEATURE_FLAGS.chat
              ? <NotFoundPage />
              : <CommunityUnavailablePage system="community" />}
          />
          <Route
            path="/users/:publicId"
            element={COMMUNITY_FEATURE_FLAGS.publicProfile
              ? <CommunityPublicProfilePage />
              : <CommunityUnavailablePage system="profile" title="公开主页尚未开放" />}
          />
        </Route>
        {COMMUNITY_FEATURE_FLAGS.news && COMMUNITY_FEATURE_FLAGS.newsAdmin ? (
          <Route element={<RequireCommunityModerator scope="news" />}>
            <Route path="/news/admin" element={<CommunityNewsAdminPage />} />
          </Route>
        ) : (
          <Route element={<RequireCommunityAccount />}>
            <Route path="/news/admin" element={<CommunityUnavailablePage system="news" title="热点资讯编辑发布台尚未开放" />} />
          </Route>
        )}
        {COMMUNITY_FEATURE_FLAGS.community ? (
          <>
            <Route element={<RequireCommunityAccount />}>
              <Route path="/community/new" element={<CommunityPostEditorPage />} />
              <Route path="/community/posts/:id/edit" element={<CommunityPostEditorPage />} />
            </Route>
            {COMMUNITY_FEATURE_FLAGS.moderation ? (
              <Route element={<RequireCommunityModerator />}>
                <Route path="/moderation" element={<CommunityModerationPage />} />
              </Route>
            ) : (
              <Route element={<RequireCommunityAccount />}>
                <Route path="/moderation" element={<CommunityUnavailablePage system="community" title="内容审核台尚未开放" />} />
              </Route>
            )}
          </>
        ) : (
          <Route element={<RequireCommunityAccount />}>
            <Route path="/moderation" element={<CommunityUnavailablePage system="community" title="内容审核台尚未开放" />} />
          </Route>
        )}
        {COMMUNITY_FEATURE_FLAGS.chat ? (
          <Route element={<RequireCommunityAccount />}>
            <Route path="/community/chat" element={<CommunityChatLobbyPage />} />
            <Route path="/community/chat/:roomSlug" element={<CommunityChatRoomPage />} />
          </Route>
        ) : (
          <Route element={<RequireCommunityAccount />}>
            <Route path="/community/chat" element={<CommunityUnavailablePage system="community" title="固定聊天室尚未开放" />} />
            <Route path="/community/chat/*" element={<CommunityUnavailablePage system="community" title="固定聊天室尚未开放" />} />
          </Route>
        )}
        <Route path="/privacy-policy" element={<CommunityPrivacyPolicyPage />} />
        <Route path="/terms-of-service" element={<CommunityTermsOfServicePage />} />
        <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="/tools" element={<PublicToolsPage />} />
      <Route path="/tools/:toolId" element={<PublicToolsPage />} />
      <Route path="/games" element={<PublicGameLayout />}>
        <Route index element={loading(<PublicGamesPage />)} />
        <Route path="snake" element={loading(<SnakeGamePage />)} />
        <Route path="tetris" element={loading(<TetrisGamePage />)} />
        <Route path="tank" element={loading(<TankBattlePage />)} />
        <Route path="three-sum" element={loading(<ThreeSumGamePage />)} />
      </Route>
    </Routes>
  );
}

export const RuntimeRouter = CommunityModeRouter;
