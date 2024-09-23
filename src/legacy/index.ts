import { decl, type Declaration, type Root, rule, type Rule } from 'postcss';
import debug from 'debug';
import get from 'dlv';
import { parseThemeKey, replaceTheme, replaceThemeRoot } from '../utils';
import type { ColorScheme, PostcssStrictThemeConfig, PostcssThemeOptions } from '../types';

const log = debug('postcss-theme-manager');

/**
 * Find all the theme variables in a CSS value and replace them with the configured theme values
 * @param config
 * @param theme
 * @param decl
 * @param colorScheme
 * @param defaultTheme
 */
function replaceThemeVariables(
  config: PostcssStrictThemeConfig,
  theme: string,
  decl: Declaration,
  colorScheme: 'light' | 'dark' = 'light',
  defaultTheme = 'default'
): void {
  const hasMultiple =
    (decl.value.match(/@theme/g) || decl.value.match(/theme\(['"]/g) || [])
      .length > 1;

  let themeKey = parseThemeKey(decl.value);

  // Found a theme reference
  while (themeKey) {
    // Check for issues with theme
    try {
      const themeDefault: string = get(
        config[defaultTheme][colorScheme],
        themeKey
      );
      const newValue: string = get(config[theme][colorScheme], themeKey);

      decl.value = replaceTheme(
        decl.value,
        hasMultiple ? newValue || themeDefault : newValue
      );

      if (decl.value === 'undefined') {
        decl.remove();
      }
    } catch (error) {
      log(error);
      throw decl.error(`Theme '${theme}' does not contain key '${themeKey}'`, {
        plugin: 'postcss-theme-manager',
      });
    }

    themeKey = parseThemeKey(decl.value);
  }
}

/**
 * Apply a transformation to a selector
 * @param selector
 * @param fn
 */
function applyToSelectors(selector: string, fn: (selector: string) => string): string {
  return selector.replace(/\n/gm, '').split(',').map(fn).join(',');
}

/**
 * Create a new rule by inject injecting theme vars into a class with theme usage
 * @param componentConfig
 * @param rule
 * @param themedDeclarations
 * @param originalSelector
 * @param defaultTheme
 */
function createNewRule(
  componentConfig: PostcssStrictThemeConfig,
  rule: Rule,
  themedDeclarations: Declaration[],
  originalSelector: string,
  defaultTheme: string
) {
  return (theme: string, colorScheme: ColorScheme) => {
    if (theme === defaultTheme && colorScheme === 'light') {
      return;
    }

    if (Object.keys(componentConfig[theme][colorScheme]).length === 0) {
      return;
    }

    const themeClass =
      (colorScheme !== 'dark' && `.${theme}`) ||
      (theme === defaultTheme && `.${colorScheme}`) ||
      `.${theme}.${colorScheme}`;

    let newSelector = applyToSelectors(originalSelector, (s) => `${themeClass} ${s}`);

    if (originalSelector.includes(':theme-root')) {
      rule.selector = replaceThemeRoot(rule.selector);

      if (rule.selector === '*') {
        newSelector = applyToSelectors(rule.selector, (s) => `${s}${themeClass}`);
      } else {
        newSelector = applyToSelectors(rule.selector, (s) => `${themeClass}${s}`);
      }
    }

    if (themedDeclarations.length > 0) {
      // Add theme to selector, clone to retain source maps
      const newRule = rule.clone({ selector: newSelector });

      newRule.removeAll();

      // Only add themed declarations to override
      for (const property of themedDeclarations) {
        const declaration = decl(property);
        replaceThemeVariables(
          componentConfig,
          theme,
          declaration,
          colorScheme,
          defaultTheme
        );

        if (declaration.value !== 'undefined') {
          newRule.append(declaration);
        }
      }

      return newRule;
    }
  }
}


/** Create theme override rule for every theme */
const createNewRules = (
  componentConfig: PostcssStrictThemeConfig,
  rule: Rule,
  themedDeclarations: Declaration[],
  defaultTheme: string
) => {
  // Need to remember original selector because we overwrite rule.selector
  // once :theme-root is found. If we don't remember the original value then
  // multiple themes break
  const originalSelector = rule.selector;
  const themes = Object.keys(componentConfig);
  const rules: Rule[] = [];

  // Create new rules for theme overrides
  for (const themeKey of themes) {
    const theme = componentConfig[themeKey];
    const themeRule = createNewRule(
      componentConfig,
      rule,
      themedDeclarations,
      originalSelector,
      defaultTheme
    );

    for (const colorScheme in theme) {
      const newRule = themeRule(themeKey, colorScheme as ColorScheme);

      if (newRule) {
        rules.push(newRule);
      }
    }
  }

  return rules;
};

/** Accomplish theming by creating new classes to override theme values  */
export const legacyTheme = (
  root: Root,
  componentConfig: PostcssStrictThemeConfig,
  options: PostcssThemeOptions
) => {
  const {
    defaultTheme = 'default',
    forceSingleTheme = undefined,
    forceEmptyThemeSelectors,
  } = options;
  let newRules: Rule[] = [];

  root.walkRules((rule) => {
    const themedDeclarations: Declaration[] = [];

    // Walk each declaration and find themed values
    rule.walkDecls((decl) => {
      const { value } = decl;

      if (parseThemeKey(value)) {
        themedDeclarations.push(decl.clone());
        // Replace defaults in original CSS rule
        replaceThemeVariables(
          componentConfig,
          defaultTheme,
          decl,
          'light',
          defaultTheme
        );
      }
    });

    let createNewThemeRules: Rule[];
    if (forceSingleTheme) {
      createNewThemeRules = [];
    } else {
      createNewThemeRules = createNewRules(
        componentConfig,
        rule,
        themedDeclarations,
        defaultTheme
      );
    }

    newRules = [...newRules, ...createNewThemeRules];
  });

  if (forceEmptyThemeSelectors) {
    const themes = Object.keys(componentConfig);
    const extra = new Set<string>();

    for (const themeKey of themes) {
      const theme = componentConfig[themeKey];

      extra.add(themeKey);

      for (const colorScheme in theme) {
        extra.add(colorScheme);
      }
    }

    extra.forEach((selector) =>
      newRules.push(rule({ selector: `.${selector}` }))
    );
  }

  newRules.forEach((r) => {
    if (forceEmptyThemeSelectors || (r.nodes && r.nodes.length > 0)) {
      root.append(r);
    }
  });
};
