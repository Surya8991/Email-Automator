// The marketing content moved to `/` (app/(marketing)/page.tsx). Keep this
// file as a redirect stub so any existing inbound links / bookmarks to
// /readme don't 404. Next handles the redirect at request time.
import { redirect } from 'next/navigation'

export default function ReadmeRedirect() {
  redirect('/')
}
