import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { useApp } from "../app-context.ts"
import { meQuery } from "./me.ts"

export const useMe = () => {
  const { api } = useApp()
  return useQuery(meQuery(api, useQueryClient()))
}

export const useConnectivity = () => {
  const { connectivity } = useApp()
  return useSyncExternalStore(connectivity.subscribe, connectivity.current)
}
