/**
 * Theme Toggle Component
 * 
 * Compact button to switch between dark and light themes.
 */

import { type Component, Show } from 'solid-js';
import { Sun, Moon } from 'lucide-solid';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';

const ThemeToggle: Component = () => {
    const { resolvedTheme, toggleTheme } = useTheme();
    const { t } = useI18n();

    return (
        <button
            class="btn-icon-xs theme-toggle-btn"
            onClick={toggleTheme}
            title={resolvedTheme() === 'dark' ? t('theme.light') as string : t('theme.dark') as string}
        >
            <Show when={resolvedTheme() === 'dark'} fallback={<Moon size={16} />}>
                <Sun size={16} />
            </Show>
        </button>
    );
};

export default ThemeToggle;
