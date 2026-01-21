/**
 * Theme Context
 * 
 * Provides dark/light mode switching for the Customer Portal.
 * Persists theme preference in localStorage.
 */

import { createSignal, createContext, useContext, type Component, type JSX, onMount } from 'solid-js';

// ============================================================================
// TYPES
// ============================================================================

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
    theme: () => Theme;
    resolvedTheme: () => ResolvedTheme;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const THEME_KEY = 'customer_portal_theme';

// ============================================================================
// HELPERS
// ============================================================================

const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const getSavedTheme = (): Theme => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
    }
    return 'system';
};

const resolveTheme = (theme: Theme): ResolvedTheme => {
    if (theme === 'system') {
        return getSystemTheme();
    }
    return theme;
};

const applyTheme = (resolvedTheme: ResolvedTheme) => {
    const root = document.documentElement;
    root.classList.remove('light-theme', 'dark-theme');
    root.classList.add(`${resolvedTheme}-theme`);
    root.setAttribute('data-theme', resolvedTheme);
};

// ============================================================================
// CONTEXT
// ============================================================================

const ThemeContext = createContext<ThemeContextValue>();

// ============================================================================
// PROVIDER
// ============================================================================

export const ThemeProvider: Component<{ children: JSX.Element }> = (props) => {
    const [theme, setThemeSignal] = createSignal<Theme>(getSavedTheme());
    const [resolvedTheme, setResolvedTheme] = createSignal<ResolvedTheme>(resolveTheme(getSavedTheme()));

    const setTheme = (newTheme: Theme) => {
        setThemeSignal(newTheme);
        const resolved = resolveTheme(newTheme);
        setResolvedTheme(resolved);
        localStorage.setItem(THEME_KEY, newTheme);
        applyTheme(resolved);
    };

    const toggleTheme = () => {
        const current = resolvedTheme();
        setTheme(current === 'dark' ? 'light' : 'dark');
    };

    onMount(() => {
        // Apply initial theme
        applyTheme(resolvedTheme());

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
        const handleChange = () => {
            if (theme() === 'system') {
                const resolved = getSystemTheme();
                setResolvedTheme(resolved);
                applyTheme(resolved);
            }
        };
        mediaQuery.addEventListener('change', handleChange);
    });

    const value: ThemeContextValue = {
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme
    };

    return (
        <ThemeContext.Provider value={value}>
            {props.children}
        </ThemeContext.Provider>
    );
};

// ============================================================================
// HOOK
// ============================================================================

export const useTheme = (): ThemeContextValue => {
    const context = useContext(ThemeContext);

    if (!context) {
        // Fallback for components outside provider
        const [theme, setThemeSignal] = createSignal<Theme>('dark');
        const [resolvedTheme, setResolvedTheme] = createSignal<ResolvedTheme>('dark');

        return {
            theme,
            resolvedTheme,
            setTheme: (newTheme: Theme) => {
                setThemeSignal(newTheme);
                setResolvedTheme(resolveTheme(newTheme));
            },
            toggleTheme: () => {
                const current = resolvedTheme();
                setThemeSignal(current === 'dark' ? 'light' : 'dark');
                setResolvedTheme(current === 'dark' ? 'light' : 'dark');
            }
        };
    }

    return context;
};

export default ThemeProvider;
