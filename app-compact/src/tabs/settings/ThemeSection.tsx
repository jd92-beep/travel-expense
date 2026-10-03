import { Sparkles } from 'lucide-react';
import { AccordionCard } from '../../components/AccordionCard';
import type { ThemePreference } from '../../lib/types';
import { THEME_OPTIONS, TRIP_THEMES } from '../../theme/tripTheme';
import { type SettingsContext } from './shared';

export function ThemeSection({ ctx }: { ctx: SettingsContext }) {
  const { state, updateState } = ctx;
  const themePreference: ThemePreference = state.themePreference;

  return (
    <>
    <AccordionCard id="settings-theme" eyebrow="外觀" title="外觀主題" icon={<Sparkles />} defaultOpen={false} meta={<span className="pill">{THEME_OPTIONS.find((o) => o.value === themePreference)?.label || '自動'}</span>}>
      <p className="muted">揀自動就跟返旅程目的地。</p>
      <div className="theme-selector" role="radiogroup" aria-label="App theme">
        {THEME_OPTIONS.map((option) => {
          const definition = option.value === 'auto' ? null : TRIP_THEMES[option.value as keyof typeof TRIP_THEMES];
          return (
            <label className="theme-option" key={option.value}>
              <input
                type="radio"
                name="app-theme"
                value={option.value}
                checked={themePreference === option.value}
                onChange={() => updateState({ themePreference: option.value })}
              />
              <span className="theme-option-copy">
                <span>{option.label}</span>
                {definition ? <small>{definition.region.motif}</small> : <small>跟目的地自動換色</small>}
                {definition ? (
                  <span className="theme-option-swatches" aria-hidden="true">
                    <i style={{ background: definition.colors.canvas }} />
                    <i style={{ background: definition.colors.accent }} />
                    <i style={{ background: definition.chart[0] }} />
                    <i style={{ background: definition.chart[1] }} />
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </AccordionCard>
    </>
  );
}
