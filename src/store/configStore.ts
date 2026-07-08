import { configureStore, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { useEffect } from 'react'
import { api, type ClassificationConfig, type EligibilityConfig, type WizardConfig } from '../services/api'
import { getClassificationConfig } from '../services/configService'

interface ConfigState {
  classification: ClassificationConfig | null
  eligibility: EligibilityConfig | null
  wizard: WizardConfig | null
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
  error: string | null
}

const initialState: ConfigState = {
  classification: null,
  eligibility: null,
  wizard: null,
  status: 'idle',
  error: null,
}

const rateMapFromTiers = (tiers: EligibilityConfig['BUSA_TIERS'] | undefined): Record<string, string> | null => {
  if (!tiers || tiers.length === 0) return null
  return Object.fromEntries(tiers.map(t => [t.cls, `${t.rate}%`]))
}

const tiersFromRateMap = (rateMap: Record<string, string>): Array<{ min: number; cls: string }> =>
  Object.entries(rateMap)
    .map(([cls, raw]) => ({ cls, min: parseFloat(String(raw).replace('%', '')) }))
    .filter(t => Number.isFinite(t.min))
    .sort((a, b) => b.min - a.min)

function normalizeClassificationConfig(cfg: ClassificationConfig, eligibility: EligibilityConfig): ClassificationConfig {
  const busaRateMap = rateMapFromTiers(eligibility.BUSA_TIERS) ?? cfg.BUSA_RATE_MAP
  const busaOptions = ['', ...Object.keys(busaRateMap).filter(Boolean)]
  return {
    ...cfg,
    UBS_CLS_OPTS: busaOptions,
    UBS_CLS_DEFAULT_RATE: busaRateMap,
    BUSA_RATE_MAP: busaRateMap,
    AGENT_RATE_UBS_TIERS: tiersFromRateMap(busaRateMap),
  }
}

export const loadConfig = createAsyncThunk('config/load', async () => {
  // getClassificationConfig() merges live LP-Master investor types into INVESTOR_TYPE_OPTS.
  // Load through it (not the raw api.config.classification()) so the store's cached config —
  // consumed by the LP Record Entry Form, Run Shadow BB, and Dashboard — carries the same
  // complete option set the screens that call getClassificationConfig() directly rely on.
  const [classificationMerged, eligibility, wizard] = await Promise.all([
    getClassificationConfig(),
    api.config.eligibility(),
    api.config.wizard(),
  ])
  return {
    classification: normalizeClassificationConfig(classificationMerged, eligibility),
    eligibility,
    wizard,
  }
})

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(loadConfig.pending, state => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadConfig.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.classification = action.payload.classification
        state.eligibility = action.payload.eligibility
        state.wizard = action.payload.wizard
      })
      .addCase(loadConfig.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message ?? 'Configuration load failed'
      })
  },
})

export const store = configureStore({
  reducer: {
    config: configSlice.reducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector = <T,>(selector: (state: RootState) => T): T => useSelector(selector)

export function useConfigCache() {
  const dispatch = useAppDispatch()
  const config = useAppSelector(state => state.config)

  useEffect(() => {
    if (config.status === 'idle') dispatch(loadConfig())
  }, [config.status, dispatch])

  return config
}
