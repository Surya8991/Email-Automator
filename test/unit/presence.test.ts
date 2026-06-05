import { describe, it, expect, beforeEach, vi } from 'vitest'
import { heartbeat, listPeers } from '@/server/presence'

describe('presence', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('a user does NOT appear in their own peer list', () => {
    heartbeat('room-1', 'u1', 'a@x.co')
    expect(listPeers('room-1', 'u1')).toEqual([])
  })

  it('other users in the same room are returned', () => {
    heartbeat('room-2', 'u1', 'a@x.co')
    heartbeat('room-2', 'u2', 'b@x.co')
    const peers = listPeers('room-2', 'u1')
    expect(peers.length).toBe(1)
    expect(peers[0]?.email).toBe('b@x.co')
  })

  it('rooms are isolated', () => {
    heartbeat('room-A', 'u1', 'a@x.co')
    heartbeat('room-B', 'u2', 'b@x.co')
    expect(listPeers('room-A', 'u1')).toEqual([])
    expect(listPeers('room-B', 'u1')).toEqual([{ email: 'b@x.co', ageMs: expect.any(Number) }])
  })

  it('heartbeat updates lastBeat (peer remains fresh)', () => {
    heartbeat('room-r', 'u1', 'a@x.co')
    heartbeat('room-r', 'u2', 'b@x.co')
    // Second heartbeat refreshes the same user, doesn't add a duplicate.
    heartbeat('room-r', 'u2', 'b@x.co')
    expect(listPeers('room-r', 'u1').length).toBe(1)
  })
})
