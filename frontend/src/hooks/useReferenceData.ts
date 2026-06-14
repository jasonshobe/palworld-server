import { useQuery } from "@tanstack/react-query"
import { getPassives, getActiveSkills, getSuitabilities } from "@/api/saves"

// Reference data is static for a build; cache it for the session.
const STATIC = { staleTime: Infinity, gcTime: Infinity }

export const usePassives = () =>
  useQuery({ queryKey: ["ref", "passives"], queryFn: getPassives, ...STATIC })

export const useActiveSkills = () =>
  useQuery({ queryKey: ["ref", "active-skills"], queryFn: getActiveSkills, ...STATIC })

export const useSuitabilities = () =>
  useQuery({ queryKey: ["ref", "suitabilities"], queryFn: getSuitabilities, ...STATIC })
