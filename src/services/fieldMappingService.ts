import { api } from './api'

export async function getAliasGroups() {
  return await api.fieldMapping.aliasGroups()
}

export async function getAllCanonicalFields() {
  return await api.fieldMapping.canonicalFields()
}

export async function getGlobalBlocklist() {
  return await api.fieldMapping.blocklist()
}

export async function getPendingSuggestions() {
  return await api.fieldMapping.suggestions()
}
