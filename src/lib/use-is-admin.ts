import { useUserStore } from '@/services/user/user.store'

// Permanent deletion is an admin-only capability. Every delete dialog gates its
// "حذف نهائي" toggle on this, and the main process re-checks the role anyway.
export function useIsAdmin(): boolean {
  return useUserStore((s) => s.currentUser?.role === 'admin')
}