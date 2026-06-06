// Copyright (c) 2026 MikeRust contributors. Licensed under AGPL-3.0-only.

/**
 * Minimal SPA router (plan §13). No history integration yet — the app
 * is a desktop shell, not a website. Pre-unlock routes (boot/setup/
 * unlock) precede the authenticated feature routes.
 */
export type Route =
  | 'boot'
  | 'setup'
  | 'unlock'
  | 'assistant'
  | 'projects'
  | 'tabular'
  | 'workflows'
  | 'templates'
  | 'settings'

/** Feature routes — the ones rendered inside the authenticated Shell. */
export const FEATURE_ROUTES = [
  'assistant',
  'projects',
  'tabular',
  'workflows',
  'templates',
  'settings',
] as const
export type FeatureRoute = (typeof FEATURE_ROUTES)[number]

export function isFeatureRoute(route: Route): route is FeatureRoute {
  return (FEATURE_ROUTES as readonly string[]).includes(route)
}

/**
 * Per-route "drill-down" data that a destination screen can read on
 * mount to restore a nested view — e.g. the Projects screen opening a
 * specific project's detail page when the user navigates back from a
 * chat that was launched from inside that project. Free-form because
 * each route owns its own restoration shape; today the only field is
 * `projectId` but new screens can add fields without churn.
 */
export type NavContext = {
  projectId?: string
}

/**
 * One "back" target on the navigation stack. `label` is what the
 * destination screen renders next to its back arrow (e.g.
 * "Torna a 'Studio 2026'"); when omitted callers should fall back
 * to the generic Common.back string.
 */
export type BackEntry = {
  route: Route
  context: NavContext
  label?: string
}

// Frozen sentinel so `consumePending()` can clear the signal without
// minting a fresh object every call. Without it Svelte sees a NEW `{}`
// reference on every clear and re-triggers any `$effect` that read the
// signal — Projects.svelte's mount effect blew up with
// `effect_update_depth_exceeded` on the first open of the screen
// (2026-06-06).
const EMPTY_CONTEXT: NavContext = Object.freeze({})

function createRouter() {
  let current = $state<Route>('boot')
  let pending = $state<NavContext>(EMPTY_CONTEXT)
  let backStack = $state<BackEntry[]>([])

  return {
    get current() {
      return current
    },

    /**
     * The top-of-stack back entry, or null if there's nothing to go
     * back to. Destination screens read this to decide whether to
     * surface a back button and what label to put on it.
     */
    get back(): BackEntry | null {
      return backStack.length > 0 ? backStack[backStack.length - 1] : null
    },

    /**
     * Standard navigation. **Clears the back stack** — the user picked
     * a sidebar entry / a deep-link directly, so they're starting a
     * fresh context and any leftover "back" target from an earlier
     * drill-down is no longer meaningful.
     */
    go(route: Route, context: NavContext = EMPTY_CONTEXT) {
      current = route
      pending = context
      if (backStack.length > 0) backStack = []
    },

    /**
     * Drill-down navigation. Pushes a back entry onto the stack so
     * the destination screen can offer a way back to the originating
     * context. Used e.g. by ProjectDetail when the user opens a chat:
     * the chat lands on Assistant, and Assistant shows a
     * "Torna a {progetto}" arrow that pops the stack.
     */
    goWithReturn(target: Route, targetContext: NavContext, entry: BackEntry) {
      backStack = [...backStack, entry]
      current = target
      pending = targetContext
    },

    /**
     * Pop the top back entry and navigate to it, restoring any
     * `context` the entry carried so the destination can rehydrate
     * its nested view (e.g. re-open the originating project detail).
     */
    popBack() {
      if (backStack.length === 0) return
      const entry = backStack[backStack.length - 1]
      backStack = backStack.slice(0, -1)
      current = entry.route
      pending = entry.context
    },

    /**
     * Routes read this once on mount and consume it (the call clears
     * the pending context so it isn't applied twice on rerenders).
     *
     * Uses the frozen `EMPTY_CONTEXT` sentinel to clear, so a caller
     * who keeps re-reading the signal in a `$effect` doesn't loop —
     * the second read sees the same reference and Svelte's
     * shallow-equal check skips the re-trigger.
     */
    consumePending(): NavContext {
      const ctx = pending
      if (pending !== EMPTY_CONTEXT) pending = EMPTY_CONTEXT
      return ctx
    },
  }
}

export const router = createRouter()
