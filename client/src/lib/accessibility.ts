import React from 'react';
import axe from '@axe-core/react';

/**
 * Accessibility Testing Utility
 * 
 * This module integrates axe-core for automated accessibility testing.
 * It runs in development mode to catch accessibility issues early.
 * 
 * Usage:
 * - Import and call initAccessibilityTesting() in your main entry file
 * - Check browser console for accessibility violations
 * 
 * Best Practices:
 * - Fix all critical and serious violations
 * - Review moderate violations for user impact
 * - Document intentional exceptions
 */

export function initAccessibilityTesting(): void {
  if (import.meta.env.DEV) {
    // Delay axe initialization to ensure DOM is ready
    setTimeout(() => {
      axe(React, document, 1000, {
        rules: [
          // Enable all rules by default
          {
            id: 'color-contrast',
            enabled: true,
          },
          {
            id: 'aria-roles',
            enabled: true,
          },
          {
            id: 'aria-required-attr',
            enabled: true,
          },
          {
            id: 'label',
            enabled: true,
          },
          {
            id: 'image-alt',
            enabled: true,
          },
          {
            id: 'heading-order',
            enabled: true,
          },
          {
            id: 'landmark-one-main',
            enabled: true,
          },
          {
            id: 'region',
            enabled: true,
          },
          {
            id: 'page-has-heading-one',
            enabled: true,
          },
        ],
      });
    }, 1000);

    console.log('[Accessibility] axe-core initialized for development testing');
  }
}

/**
 * Manual accessibility checks for common issues
 */
export const accessibilityChecks = {
  /**
   * Check if element has proper focus indicator
   */
  hasFocusIndicator(element: HTMLElement): boolean {
    const styles = window.getComputedStyle(element);
    return styles.outline !== 'none' || styles.boxShadow !== 'none';
  },

  /**
   * Check color contrast ratio (simplified)
   * Returns true if contrast appears sufficient
   */
  hasGoodContrast(foreground: string, background: string): boolean {
    // Simple check - in production, use a proper contrast calculation
    const lightColors = ['#ffffff', '#f8fafc', '#f1f5f9', 'white', 'rgb(255,255,255)'];
    const darkColors = ['#0f172a', '#1e1b4b', '#000000', 'black', 'rgb(0,0,0)'];
    
    const fg = foreground.toLowerCase();
    const bg = background.toLowerCase();
    
    // Check if we have light on dark or dark on light
    const isFgLight = lightColors.some(c => fg.includes(c));
    const isFgDark = darkColors.some(c => fg.includes(c));
    const isBgLight = lightColors.some(c => bg.includes(c));
    const isBgDark = darkColors.some(c => bg.includes(c));
    
    return (isFgLight && isBgDark) || (isFgDark && isBgLight);
  },

  /**
   * Validate ARIA attributes on an element
   */
  validateAria(element: HTMLElement): string[] {
    const issues: string[] = [];
    
    // Check for role without aria-label on interactive elements
    const role = element.getAttribute('role');
    const ariaLabel = element.getAttribute('aria-label');
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    
    if (role && !ariaLabel && !ariaLabelledBy && !element.textContent?.trim()) {
      issues.push(`Element with role="${role}" missing accessible label`);
    }
    
    // Check for images without alt
    if (element.tagName === 'IMG' && !element.hasAttribute('alt')) {
      issues.push('Image missing alt attribute');
    }
    
    return issues;
  },
};

/**
 * Accessibility guidelines for developers
 */
export const accessibilityGuidelines = {
  // Color contrast requirements
  contrast: {
    normalText: '4.5:1 minimum ratio',
    largeText: '3:1 minimum ratio',
    uiComponents: '3:1 minimum ratio',
  },
  
  // Focus requirements
  focus: {
    visible: 'All interactive elements must have visible focus indicators',
    order: 'Tab order must follow logical reading order',
    trap: 'Avoid keyboard traps',
  },
  
  // ARIA guidelines
  aria: {
    landmarks: 'Use landmark roles (main, nav, aside, etc.)',
    labels: 'All interactive elements must have accessible names',
    live: 'Use aria-live for dynamic content updates',
  },
  
  // Semantic HTML
  semantic: {
    headings: 'Use proper heading hierarchy (h1-h6)',
    lists: 'Use ul/ol for lists, not just visual styling',
    tables: 'Use table elements for tabular data',
  },
};
