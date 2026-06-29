/**
 * Global auth + UI state via Zustand.
 * Persisted to localStorage via tokenStorage.
 */
'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, ModuleAccess, UserRole } from './types'
import { tokenStorage } from './api'
import { parseJWT } from './utils'

export { parseJWT }

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  _hasHydrated: boolean   // true once Zustand has rehydrated from localStorage

  // Actions
  setUser: (user: User) => void
  setTokens: (access: string, refresh: string) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  refreshUser: () => Promise<void>
  _setHasHydrated: (v: boolean) => void

  // Derived helpers
  hasModule: (module: ModuleAccess) => boolean
  isRole: (...roles: UserRole[]) => boolean
  isStaff: () => boolean
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      _hasHydrated: false,

      _setHasHydrated: (v) => set({ _hasHydrated: v }),

      setUser: (user) =>
        set({ user, isAuthenticated: true }),

      setTokens: (access, refresh) => {
        tokenStorage.setTokens(access, refresh)
        const payload = parseJWT(access)
        if (payload) {
          set((state) => ({
            isAuthenticated: true,
            user: state.user
              ? { ...state.user, module_access: (payload.module_access as ModuleAccess[]) ?? state.user.module_access ?? [] }
              : state.user,
          }))
        } else {
          set({ isAuthenticated: true })
        }
      },

      logout: () => {
        tokenStorage.clearTokens()
        set({ user: null, isAuthenticated: false })
      },

      setLoading: (loading) => set({ isLoading: loading }),

      refreshUser: async () => {
        try {
          const { authAPI } = await import('./api')
          const response = await authAPI.getProfile()
          const next = response.data
          const current = get().user
          // Skip state update when profile unchanged — avoids re-render cascades
          if (
            current &&
            current.id === next.id &&
            current.role === next.role &&
            JSON.stringify(current.module_access) === JSON.stringify(next.module_access)
          ) {
            return
          }
          set({ user: next, isAuthenticated: true })
        } catch {
          // Token might be invalid
        }
      },

      hasModule: (module) => {
        const { user } = get()
        if (user?.module_access?.includes(module)) return true
        if (module === 'learning' && user?.role) {
          return ['STUDENT', 'EXAMINER', 'DEPARTMENT_ADMIN', 'HOD', 'FACULTY_ADMIN', 'SUPER_ADMIN'].includes(user.role)
        }
        return false
      },

      isRole: (...roles) => {
        const { user } = get()
        return roles.some((r) => user?.role === r)
      },

      isStaff: () => {
        const { user } = get()
        return user?.role !== 'STUDENT'
      },

      isAdmin: () => {
        const { user } = get()
        return user?.role === 'SUPER_ADMIN'
      },
    }),
    {
      name: 'ibbul-auth',
      skipHydration: true,
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Called once localStorage has been read and state restored.
        if (state) {
          // If the persisted state says authenticated but there is no valid token,
          // reset auth state now so the guard never sees a mismatch.
          const { isTokenExpired } = require('./utils') as typeof import('./utils')
          const raw = typeof window !== 'undefined' ? localStorage.getItem('ibbul_access') : null
          if (state.isAuthenticated && (!raw || isTokenExpired(raw))) {
            state.isAuthenticated = false
            state.user = null
          }
          state._setHasHydrated(true)
        }
      },
    }
  )
)

// ─── UI store (sidebar state, etc.) ─────────────────────────────────────────

interface UIState {
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: 'ibbul-ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
)
