'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchSignatureAction } from '@/server/actions/gmail'

// Only renders if Google OAuth is configured. The action itself fails
// loudly if the user signed in via magic link instead of Google.
export function GmailCard() {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <Button type="button" variant="outline" disabled={pending}
      onClick={() => start(async () => {
        const r = await fetchSignatureAction()
        if ('error' in r && r.error) { toast.error(r.error); return }
        if ('signature' in r) {
          if (!r.signature) toast(r.message ?? 'No signature on file in Gmail.')
          else toast.success(`Imported your Gmail signature (${r.signature.length} chars).`)
          router.refresh()
        }
      })}>
      <Mail className="mr-1.5 h-4 w-4" /> {pending ? 'Fetching…' : 'Import from Gmail'}
    </Button>
  )
}
