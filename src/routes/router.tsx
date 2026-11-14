import { createBrowserRouter, redirect } from 'react-router-dom'
import { RootLayout } from '@/components'
import { LoginPage } from '@/pages/LoginPage'
import { StartPage } from '@/pages/StartPage'
import { OnboardingProfilePage } from '@/pages/OnboardingProfilePage'
import { OnboardingLifestylePage } from '@/pages/OnboardingLifestylePage'
import { OnboardingConcernsPage } from '@/pages/OnboardingConcernsPage'
import { OnboardingEmotionsPage } from '@/pages/OnboardingEmotionsPage'
import { OnboardingStoryPage } from '@/pages/OnboardingStoryPage'
import { HomePage } from '@/pages/HomePage'
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
import { MeetingsPage } from '@/pages/MeetingsPage'
import { MeetingDetailPage } from '@/pages/MeetingDetailPage'
import { MeetingChatPage } from '@/pages/MeetingChatPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { RecordDetailPage } from '@/pages/RecordDetailPage'
import { MyPage } from '@/pages/MyPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RootEntryError } from '@/pages/RootEntryError'
import axios from 'axios'
import { apiClient, getAccessToken, setAccessToken } from '@/lib/api-client'
import { isOnboardingPreview } from '@/features/onboarding'

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
      { path: '/onboarding/lifestyle', element: <OnboardingLifestylePage /> },
      { path: '/onboarding/concerns', element: <OnboardingConcernsPage /> },
      { path: '/onboarding/emotions', element: <OnboardingEmotionsPage /> },
      { path: '/onboarding/story', element: <OnboardingStoryPage /> },
      { path: '/home', element: <HomePage /> },
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
      { path: '/meetings', element: <MeetingsPage /> },
      { path: '/meetings/:meetingId', element: <MeetingDetailPage /> },
      { path: '/meetings/:meetingId/chat', element: <MeetingChatPage /> },
      { path: '/records', element: <RecordsPage /> },
      { path: '/records/:recordId', element: <RecordDetailPage /> },
      { path: '/my', element: <MyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
