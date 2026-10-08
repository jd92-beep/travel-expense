import { useEffect, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import { AccordionCard } from '../../components/AccordionCard';
import type { ThemePreference } from '../../lib/types';
import { THEME_OPTIONS, TRIP_THEMES, type ThemeDefinition } from '../../theme/tripTheme';
import { type SettingsContext } from './shared';

// Latin-only subset (`text=`) so the style previews show each face without pulling CJK files.
const PREVIEW_FONTS = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Fredoka:wght@600&family=Baloo+2:wght@800&family=Cherry+Bomb+One&family=Chakra+Petch:wght@700&family=DotGothic16&family=Chiron+Sung+HK:wght@900&family=Gowun+Batang:wght@700&text=Aa%24123&display=swap';

type Option = (typeof THEME_OPTIONS)[number];

function definitionFor(option: Option): ThemeDefinition | null {
  return option.value === 'auto' ? null : TRIP_THEMES[option.value as keyof typeof TRIP_THEMES];
}

export function ThemeSection({ ctx }: { ctx: SettingsContext }) {
  const { state, updateState } = ctx;
  const themePreference: ThemePreference = state.themePreference;
  const regionOptions = THEME_OPTIONS.filter((option) => !definitionFor(option)?.kit);
  const styleOptions = THEME_OPTIONS.filter((option) => definitionFor(option)?.kit);

  useEffect(() => {
    if (document.querySelector('link[data-style-preview-fonts]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = PREVIEW_FONTS;
    link.dataset.stylePreviewFonts = '';
    document.head.appendChild(link);
  }, []);

  const renderOption = (option: Option) => {
    const definition = definitionFor(option);
    const kit = definition?.kit;
    return (
      <label className={kit ? 'theme-option theme-option--style' : 'theme-option'} key={option.value}>
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
          {kit && definition ? (
            <span
              className="theme-style-preview"
              data-preview-style={kit.style}
              aria-hidden="true"
              style={{
                '--pv-canvas': definition.colors.canvas,
                '--pv-card': definition.colors.card,
                '--pv-text': definition.colors.text,
                '--pv-accent': definition.colors.accent,
                '--pv-on-accent': definition.colors.onAccent,
                '--pv-alt': definition.chart[1],
              } as CSSProperties}
            >
              <b>Aa</b>
              <i>$123</i>
            </span>
          ) : definition ? (
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
  };

  return (
    <>
    <AccordionCard id="settings-theme" eyebrow="外觀" title="外觀主題" icon={<Sparkles />} defaultOpen={false} meta={<span className="pill">{THEME_OPTIONS.find((o) => o.value === themePreference)?.label || '自動'}</span>}>
      <p className="muted">揀自動就跟返旅程目的地。風格主題會連按鈕、卡片、字體同導航列一齊換。</p>
      <div className="theme-selector-group">
        <h4 id="theme-group-region">旅程地區</h4>
        <div className="theme-selector" role="radiogroup" aria-labelledby="theme-group-region">
          {regionOptions.map(renderOption)}
        </div>
      </div>
      <div className="theme-selector-group">
        <h4 id="theme-group-style">風格主題</h4>
        <div className="theme-selector theme-selector--style" role="radiogroup" aria-labelledby="theme-group-style">
          {styleOptions.map(renderOption)}
        </div>
      </div>
    </AccordionCard>
    </>
  );
}
