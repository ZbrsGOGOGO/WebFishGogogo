import { createEffect } from "solid-js"
import { createMutable, modifyMutable, reconcile } from "solid-js/store"

type CreatePersistantParams<T> = {
  namespace: string
  init: () => T
}
export function createPersistantMutable<T extends Record<string, any>>(
  params: CreatePersistantParams<T>,
) {
  let persistedState: string | null = null
  try { persistedState = localStorage.getItem(params.namespace) } catch { /* Opaque sandbox: storage intentionally unavailable. */ }
  let restored: T | undefined
  try { if (persistedState) restored = JSON.parse(persistedState) } catch { /* Ignore corrupt optional save data. */ }
  const mutable = createMutable<T>(
    restored ?? params.init(),
  )

  createEffect(() => {
    try { localStorage.setItem(params.namespace, JSON.stringify(mutable)) } catch { /* Current run stays in memory; no fake persistence. */ }
  })

  return mutable
}

export function setMutable<T>(mutable: T, value: T) {
  modifyMutable(mutable, reconcile(value))
}
