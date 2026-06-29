import {
  getClassificationConfig,
  buildBusaRateFractions,
  type ClassificationConfig,
} from './configService'

export async function getClassificationOptions() {
  const cfg = await getClassificationConfig()
  return {
    CLS_OPTS: cfg.CLS_OPTS,
    REGION_OPTS: cfg.REGION_OPTS,
    TYPE_OPTS: cfg.TYPE_OPTS,
    SP_RATING_OPTS: cfg.SP_RATING_OPTS,
    MDY_RATING_OPTS: cfg.MDY_RATING_OPTS,
    FITCH_RATING_OPTS: cfg.FITCH_RATING_OPTS,
  }
}

export function getRateMaps(cfg: ClassificationConfig) {
  return {
    BUSA_RATE_MAP: cfg.BUSA_RATE_MAP,
    BUSA_RATE_FRACTIONS: buildBusaRateFractions(cfg),
    AGENT_RATE_MAP: cfg.AGENT_RATE_MAP,
    CLS_TAG_MAP: cfg.CLS_TAG_MAP,
  }
}

export function getClassificationCriteria(cfg: ClassificationConfig) {
  return cfg.CLS_CRITERIA
}
