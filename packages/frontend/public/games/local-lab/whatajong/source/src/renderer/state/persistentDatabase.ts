import type { Database } from "@/lib/in-memoriam"
import { createEffect } from "solid-js"

type CreateDbParams<T> = {
  namespace: string
  db: T
  init: () => void
}
export function createPersistentDatabase<T extends Database<any, any>>(
  params: CreateDbParams<T>,
) {
  let persistedState: string | null = null
  try { persistedState = localStorage.getItem(params.namespace) } catch { /* Opaque sandbox: storage intentionally unavailable. */ }
  const db = params.db

  if (persistedState) {
    try { db.update(JSON.parse(persistedState)) } catch { params.init() }
  } else {
    params.init()
  }

  createEffect(() => {
    try { localStorage.setItem(params.namespace, JSON.stringify(db.byId)) } catch { /* In-memory run only. */ }
  })
}
