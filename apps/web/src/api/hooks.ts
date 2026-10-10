import type { Child, Household } from "@bt/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { useApp } from "../app-context.ts"
import { meQuery } from "./me.ts"
import { type ChildFields, type HouseholdChange, rememberSaved, saveChild, saveHousehold } from "./settings.ts"

export const useMe = () => {
  const { api } = useApp()
  return useQuery(meQuery(api, useQueryClient()))
}

export const useConnectivity = () => {
  const { connectivity } = useApp()
  return useSyncExternalStore(connectivity.subscribe, connectivity.current)
}

export const useSaveHousehold = () => {
  const { api } = useApp()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ household, change }: { readonly household: Household; readonly change: HouseholdChange }) =>
      saveHousehold(api, household, change),
    onSuccess: ({ household, changed }) =>
      rememberSaved(
        queryClient,
        (me) => ({ ...me, household: { ...household, caregivers: me.household.caregivers } }),
        changed,
      ),
  })
}

export const useSaveChild = () => {
  const { api } = useApp()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ child, fields }: { readonly child: Child; readonly fields: ChildFields }) =>
      saveChild(api, child, fields),
    onSuccess: ({ child, changed }) => rememberSaved(queryClient, (me) => ({ ...me, child }), changed),
  })
}

export type SaveChild = ReturnType<typeof useSaveChild>
