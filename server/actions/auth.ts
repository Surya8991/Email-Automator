'use server'
import { signOut } from '@/auth'

// Module-level sign-out server action. Previously inlined inside the
// Topbar server component as an arrow function with an embedded
// 'use server' — that pattern works in dev but the closure gets a new
// id on every server render in prod, which broke /profile (and other
// pages) on Vercel with ERROR 259737202.
//
// Hoisting to a stable module export gives the action a fixed id Next
// can serialize once and reuse across renders.
export async function signOutAction() {
  await signOut({ redirectTo: '/login' })
}
