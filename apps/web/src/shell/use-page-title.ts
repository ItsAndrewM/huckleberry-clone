import { useEffect } from "react"

export const APP_NAME = "Baby tracker"

export const usePageTitle = (title: string) => {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`
  }, [title])
}
