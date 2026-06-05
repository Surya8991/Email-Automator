'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { replayOnboardingAction } from '@/server/actions/onboarding-replay'

// Lets a user re-trigger the 4-step onboarding modal from /profile.
// Previously the only way to show it again was for an admin to bump
// ONBOARDING_CURRENT_VERSION, which is a deploy. This button resets
// the per-user seen-version setting + reloads so the modal appears
// on the next render.

export function OnboardingReplayButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline" size="sm" disabled={pending}
      onClick={() => start(async () => {
        const r = await replayOnboardingAction()
        if ('ok' in r && r.ok) {
          toast.success('Tour will replay on the next page load')
          router.refresh()
        } else {
          toast.error('Could not reset onboarding')
        }
      })}
      title="Replay the first-time onboarding tour"
    >
      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Replay onboarding
    </Button>
  )
}
