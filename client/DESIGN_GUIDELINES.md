# Design Guidelines & Best Practices

This document outlines the design tools, standards, and best practices for the IxaSales project.

## Design Quality Tools

### 1. ESLint - Code Quality
**Configuration:** [`.eslintrc.config.js`](.eslintrc.config.js)

Checks for:
- TypeScript best practices
- Code consistency
- Potential bugs

**Commands:**
```bash
npm run lint          # Check for issues
npm run lint -- --fix # Fix auto-fixable issues
```

### 2. Prettier - Code Formatting
**Configuration:** [`.prettierrc`](.prettierrc)

Ensures consistent formatting:
- 2-space indentation
- Single quotes
- Semicolons
- 100 character line width

**Commands:**
```bash
npm run format          # Format all files
npm run format:check    # Check formatting without fixing
```

### 3. Stylelint - CSS Quality
**Configuration:** [`.stylelintrc.json`](.stylelintrc.json)

Checks for:
- Invalid CSS properties
- Duplicate selectors
- Nesting depth (max 4 levels)
- Color contrast issues
- Best practices

**Commands:**
```bash
npm run lint:css        # Check CSS files
npm run lint:css:fix    # Fix auto-fixable issues
```

### 4. Storybook - Component Documentation
**Configuration:** [`.storybook/main.ts`](.storybook/main.ts)

Features:
- Interactive component playground
- Accessibility testing addon
- Visual documentation
- Design system showcase

**Commands:**
```bash
npm run storybook       # Start Storybook dev server
npm run build-storybook # Build static Storybook
```

### 5. axe-core - Accessibility Testing
**Location:** [`src/lib/accessibility.ts`](src/lib/accessibility.ts)

Checks for:
- Color contrast violations
- Missing ARIA labels
- Improper heading hierarchy
- Keyboard navigation issues

## Design System

### CSS Variables
All design tokens are defined in [`src/styles/variables.css`](src/styles/variables.css):

```css
/* Colors */
--bg-primary: #0f172a;
--text-primary: #ffffff;
--color-primary: #6366f1;

/* Spacing */
--spacing-sm: 0.5rem;
--spacing-md: 1rem;
--spacing-lg: 1.5rem;

/* Border Radius */
--radius-md: 12px;
--radius-lg: 16px;
```

### Tailwind Configuration
Custom theme extensions in [`tailwind.config.js`](tailwind.config.js):
- Custom colors (slate-850)
- Font family (Inter)

## Best Practices

### Component Design
1. **Props Interface**: Always define TypeScript interfaces
2. **Accessibility**: Include ARIA labels, focus states
3. **Responsive**: Mobile-first approach
4. **Theming**: Use CSS variables for colors

### CSS Guidelines
1. **Variables**: Use CSS custom properties from `variables.css`
2. **Nesting**: Maximum 4 levels deep
3. **Specificity**: Avoid `!important`
4. **Units**: Use rem for sizing, px only for borders

### Accessibility Standards
1. **Contrast**: Minimum 4.5:1 for normal text
2. **Focus**: Visible focus indicators on all interactive elements
3. **Labels**: All form inputs must have labels
4. **Headings**: Proper hierarchy (h1 → h2 → h3)

## Running All Design Checks

```bash
# Check everything (lint, format, css)
npm run design:check

# Fix everything automatically
npm run design:fix
```

## Component Story Template

When creating new components, add a `.stories.tsx` file:

```tsx
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import YourComponent from './YourComponent';

const meta = {
  title: 'Components/YourComponent',
  component: YourComponent,
  tags: ['autodocs'],
  argTypes: {
    // Define your props here
  },
} satisfies Meta<typeof YourComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    // Default props
  },
};
```

## Design Review Checklist

Before submitting code:
- [ ] ESLint passes (`npm run lint`)
- [ ] Prettier formatting applied (`npm run format`)
- [ ] Stylelint passes (`npm run lint:css`)
- [ ] Component has Storybook story
- [ ] Accessibility guidelines followed
- [ ] Mobile responsive
- [ ] Dark/light theme compatible
