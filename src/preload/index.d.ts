import type { IdeTermApi } from '@shared/api'

declare global {
  interface Window {
    api: IdeTermApi
  }
}

export {}
