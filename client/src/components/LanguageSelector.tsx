/**
 * Language Selector Component
 * 
 * Compact language switcher with short codes (UZ, РУ, EN).
 */

import { type Component, For } from 'solid-js';
import { useI18n, type Language } from '../i18n';

const languageShortLabels: Record<Language, string> = {
    uz: 'UZ',
    ru: 'РУ',
    en: 'EN'
};

const LanguageSelector: Component = () => {
    const { language, setLanguage, availableLanguages } = useI18n();

    return (
        <select
            value={language()}
            onChange={(e) => setLanguage(e.currentTarget.value as Language)}
            class="language-select-compact"
        >
            <For each={availableLanguages}>{(lang) => (
                <option value={lang}>{languageShortLabels[lang]}</option>
            )}</For>
        </select>
    );
};

export default LanguageSelector;
