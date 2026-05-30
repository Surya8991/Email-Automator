'use client'
import { useFormStatus } from 'react-dom'
import { Button, type ButtonProps } from '@/components/ui/button'

// Client wrapper that flips to a disabled spinning state while the parent
// server-action <form> is submitting. Used by both the Google and
// magic-link buttons so the page never feels frozen after a click.
export function SubmitButton({
  children,
  pendingChildren,
  ...props
}: ButtonProps & { pendingChildren?: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button {...props} type="submit" disabled={pending || props.disabled}>
      {pending ? (
        <>
          <Spinner /> {pendingChildren ?? 'Please wait…'}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

function Spinner() {
  return (
    <svg
      className="mr-2 h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
