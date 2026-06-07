import { CLS_OPTS, REGION_OPTS, TYPE_OPTS, SP_RATING_OPTS, MDY_RATING_OPTS, FITCH_RATING_OPTS, BUSA_RATE_MAP, AGENT_RATE_MAP, CLS_TAG_MAP, CLS_CRITERIA } from '../config/classificationConfig'
import { api } from './api'

const _local = { CLS_OPTS, REGION_OPTS, TYPE_OPTS, SP_RATING_OPTS, MDY_RATING_OPTS, FITCH_RATING_OPTS }

export async function getClassificationOptions(live: boolean) {
  if (!live) return _local
  return (await api.config.classification()) as typeof _local
}

export function getRateMaps()             { return { BUSA_RATE_MAP, AGENT_RATE_MAP, CLS_TAG_MAP } }
export function getClassificationCriteria() { return CLS_CRITERIA }
