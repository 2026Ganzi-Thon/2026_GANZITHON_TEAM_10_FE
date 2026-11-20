import { createBrowserRouter, matchRoutes, redirect } from 'react-router-dom'
import type { LoaderFunctionArgs } from 'react-router-dom'
import { RootLayout } from '@/components'
import { LoginPage } from '@/pages/LoginPage'
import { StartPage } from '@/pages/StartPage'
import { OnboardingProfilePage } from '@/pages/OnboardingProfilePage'
import { HomePage } from '@/pages/HomePage'
import { AboutPage } from '@/pages/AboutPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { DrawingPage } from '@/pages/DrawingPage'
import { DrawingOnboardingFirstPage } from '@/pages/DrawingOnboardingFirstPage'
import { DrawingOnboardingSecondPage } from '@/pages/DrawingOnboardingSecondPage'
import { DrawingOnboardingThirdPage } from '@/pages/DrawingOnboardingThirdPage'
import { DrawingCanvasPage } from '@/pages/DrawingCanvasPage'
import { DrawingUploadPage } from '@/pages/DrawingUploadPage'
import { DrawingCameraPage } from '@/pages/DrawingCameraPage'
import { DrawingDetailsPage } from '@/pages/DrawingDetailsPage'
import { DrawingConversationPage } from '@/pages/DrawingConversationPage'
import { DrawingResultPage } from '@/pages/DrawingResultPage'
import { SessionsPage } from '@/pages/SessionsPage'
import { MeetingCreatePage } from '@/pages/MeetingCreatePage'
import { MeetingsPage } from '@/pages/MeetingsPage'
import { MeetingDetailPage } from '@/pages/MeetingDetailPage'
import { MeetingWaitingPage } from '@/pages/MeetingWaitingPage'
import { MeetingChatPage } from '@/pages/MeetingChatPage'
import { MeetingDrawingPage } from '@/pages/MeetingDrawingPage'
import { MeetingHistoryPage } from '@/pages/MeetingHistoryPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { RecordDetailPage } from '@/pages/RecordDetailPage'
import { MyPage } from '@/pages/MyPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { PlansPage } from '@/pages/PlansPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RootEntryError } from '@/pages/RootEntryError'
import axios from 'axios'
import { apiClient, getAccessToken, setAccessToken } from '@/lib/api-client'
import { isOnboardingPreview } from '@/features/onboarding'

const meetingCreatePath = '/meetings/create'

const getMeetingCreatePath = (): string | undefined => {
  const match = matchRoutes(router.routes, meetingCreatePath)?.at(-1)
  return match?.route.path === meetingCreatePath ? meetingCreatePath : undefined
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        loader: async ({ request }) => {
          if (!getAccessToken()) return redirect('/onboarding')
          try {
            const { data } = await apiClient.get<{
              success: boolean
              data: { onboarding: object | null } | null
            }>('/api/users/me', { signal: request.signal })
            if (
              !data.success ||
              !data.data ||
              (data.data.onboarding !== null &&
                (typeof data.data.onboarding !== 'object' || Array.isArray(data.data.onboarding)))
            )
              throw new Error('Invalid response')
            return redirect(data.data.onboarding === null ? '/onboarding/profile' : '/home')
          } catch (error) {
            if (request.signal.aborted) throw error
            if (axios.isAxiosError(error) && error.response?.status === 401) {
              setAccessToken(null)
              return redirect('/login')
            }
            throw error
          }
        },
        errorElement: <RootEntryError />,
      },
      { path: '/onboarding', element: <StartPage /> },
      {
        path: '/login',
        element: <LoginPage />,
      },
      {
        path: '/onboarding/profile',
        loader: ({ request }) =>
          isOnboardingPreview(new URL(request.url).search) || getAccessToken()
            ? null
            : redirect('/onboarding'),
        element: <OnboardingProfilePage />,
      },
      ...['lifestyle', 'concerns', 'emotions', 'story'].map((section, index) => ({
        path: `/onboarding/${section}`,
        loader: ({ request }: LoaderFunctionArgs) => {
          const params = new URL(request.url).searchParams
          params.set('page', String(index + 2))
          return redirect(`/onboarding/profile?${params}`)
        },
      })),
      { path: '/home', element: <HomePage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '/notifications', element: <NotificationsPage /> },
      { path: '/drawing', element: <DrawingPage /> },
      { path: '/drawing/onboarding/1', element: <DrawingOnboardingFirstPage /> },
      { path: '/drawing/onboarding/2', element: <DrawingOnboardingSecondPage /> },
      { path: '/drawing/onboarding/3', element: <DrawingOnboardingThirdPage /> },
      { path: '/drawing/canvas', element: <DrawingCanvasPage /> },
      { path: '/drawing/upload', element: <DrawingUploadPage /> },
      { path: '/drawing/camera', element: <DrawingCameraPage /> },
      { path: '/drawing/details', element: <DrawingDetailsPage /> },
      { path: '/drawing/conversation', element: <DrawingConversationPage /> },
      { path: '/drawing/result', element: <DrawingResultPage /> },
      { path: '/sessions', element: <SessionsPage /> },
      { path: '/meetings', element: <MeetingsPage getCreatePath={getMeetingCreatePath} /> },
      { path: '/meetings/create', element: <MeetingCreatePage /> },
      { path: '/meetings/:meetingId', element: <MeetingDetailPage /> },
      { path: '/meetings/:meetingId/waiting', element: <MeetingWaitingPage /> },
      { path: '/meetings/:meetingId/chat', element: <MeetingChatPage /> },
      { path: '/meetings/:meetingId/drawing/:step', element: <MeetingDrawingPage /> },
      { path: '/meetings/:meetingId/history', element: <MeetingHistoryPage /> },
      { path: '/records', element: <RecordsPage /> },
      { path: '/records/:recordId', element: <RecordDetailPage /> },
      { path: '/my', element: <MyPage /> },
      { path: '/my/profile', element: <ProfilePage /> },
      { path: '/my/plans', element: <PlansPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
