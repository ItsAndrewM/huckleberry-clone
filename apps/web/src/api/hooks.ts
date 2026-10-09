import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useApp } from "../app-context.ts"
import { meQuery } from "./me.ts"

export const useMe = () => {
  const { api } = useApp()
  return useQuery(meQuery(api, useQueryClient()))
}
