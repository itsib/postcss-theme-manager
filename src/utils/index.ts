import path from 'node:path';
import fs from 'node:fs';
import merge from 'deepmerge';
import type { ColorScheme, LightDarkTheme, PostcssStrictThemeConfig, PostcssThemeConfig, Theme } from '../types';

const THEME_USAGE_REGEX = /@theme\s+\$?([a-zA-Z-_0-9.]+)/;
const ALT_THEME_USAGE_REGEX = /theme\(\s*['"]([a-zA-Z-_0-9.]+)['"]\s*\)/;

/**
 * Get the theme variable name from a string
 * @param value
 */
export function parseThemeKey(value: string): string {
  let key = value.match(THEME_USAGE_REGEX);

  if (key) {
    return key[1];
  }

  key = value.match(ALT_THEME_USAGE_REGEX);

  if (key) {
    return key[1];
  }

  return '';
}

/**
 * Replace a theme variable reference with a value
 * @param value
 * @param replace
 */
export function replaceTheme(value: string, replace: string): string {
  if (value.match(THEME_USAGE_REGEX)) {
    return value.replace(THEME_USAGE_REGEX, replace);
  }

  return value.replace(ALT_THEME_USAGE_REGEX, replace);
}

/**
 * Get the location of the theme file
 * @param cssFile
 */
export function getThemeFilename(cssFile: string): string {
  let themePath = path.join(path.dirname(cssFile), 'theme.ts');

  if (!fs.existsSync(themePath)) {
    themePath = path.join(path.dirname(cssFile), 'theme.js');
  }

  return themePath;
}

/**
 * Remove :theme-root usage from a selector
 * @param selector
 */
export function replaceThemeRoot(selector: string): string {
  return selector.replace(/:theme-root\((\S+)\)/g, '$1').replace(/:theme-root/g, '');
}

/**
 * Make a SimpleTheme into a LightDarkTheme
 * @param config
 */
export function normalizeTheme(config: PostcssThemeConfig | {}): PostcssStrictThemeConfig {
  return Object.keys(config).reduce((acc, theme) => {
    const themeConfig = (config as any)[theme];
    if ('light' in themeConfig && 'dark' in themeConfig) {
      return { ...acc, [theme]: themeConfig };
    }

    if (themeConfig.extends) {
      const configWithoutExtends = { ...themeConfig };

      delete configWithoutExtends.extends;

      acc[theme] = {
        extends: themeConfig.extends,
        light: configWithoutExtends,
        dark: {},
      }
    } else {
      acc[theme] = { light: themeConfig, dark: {} }
    }
    return acc;
  }, {} as PostcssStrictThemeConfig);
}

/**
 * Resolve any "extends" fields for a theme
 * @param config
 */
export function resolveThemeExtension(config: PostcssStrictThemeConfig): PostcssStrictThemeConfig {
  const checkExtendSelf = (theme: string, extendsTheme: string) => {
    if (extendsTheme === theme) {
      throw new Error(
        `A theme cannot extend itself! '${theme}' extends '${extendsTheme}'`
      );
    }
  };

  const checkThemeExists = (extendsTheme: string) => {
    if (!config[extendsTheme]) {
      throw new Error(`Theme to extend from not found! '${extendsTheme}'`);
    }
  };

  const checkCycles = (theme: string, colorScheme?: ColorScheme) => {
    const chain = [theme];
    let currentTheme = colorScheme
      ? config[theme][colorScheme].extends
      : config[theme].extends;

    while (currentTheme) {
      if (chain.includes(currentTheme)) {
        chain.push(currentTheme);
        throw new Error(
          `Circular theme extension found! ${chain
            .map((i) => `'${i}'`)
            .join(' => ')}`
        );
      }

      chain.push(currentTheme);
      currentTheme = colorScheme
        ? config[currentTheme][colorScheme].extends
        : config[currentTheme].extends;
    }
  };

  const resolveSubTheme = (theme: string) => {
    const subConfig = { ...config };
    delete subConfig[theme];

    Object.keys(subConfig).forEach((t) => {
      if (
        subConfig[t].extends === theme ||
        subConfig[t].light.extends === theme ||
        subConfig[t].dark.extends === theme
      ) {
        delete subConfig[t];
      }
    });

    resolveThemeExtension(subConfig);
  };

  const resolveColorSchemeTheme = (
    themeConfig: LightDarkTheme,
    theme: string,
    colorScheme: ColorScheme
  ) => {
    const extendsTheme = themeConfig[colorScheme].extends;

    let extras = {};

    if (extendsTheme) {
      checkThemeExists(extendsTheme);
      checkExtendSelf(theme, extendsTheme);
      checkCycles(theme, colorScheme);

      if (config[extendsTheme][colorScheme].extends) {
        resolveSubTheme(theme);
      }

      extras = config[extendsTheme][colorScheme];
      delete themeConfig[colorScheme].extends;
    }

    return extras;
  };

  Object.keys(config).forEach(theme => {
    const themeConfig = config[theme];
    let lightExtras = {};
    let darkExtras = {};

    if (themeConfig.extends) {
      checkThemeExists(themeConfig.extends);
      checkExtendSelf(theme, themeConfig.extends);
      checkCycles(theme);

      if (config[themeConfig.extends]) {
        resolveSubTheme(theme);
      }

      const newConfig = merge(config[themeConfig.extends], themeConfig);
      delete themeConfig.extends;
      themeConfig.light = newConfig.light;
      themeConfig.dark = newConfig.dark;
    }

    if (themeConfig.light.extends) {
      lightExtras = resolveColorSchemeTheme(themeConfig, theme, 'light');
    }

    if (themeConfig.dark.extends) {
      darkExtras = resolveColorSchemeTheme(themeConfig, theme, 'dark');
    }

    themeConfig.light = { ...lightExtras, ...themeConfig.light };
    themeConfig.dark = { ...darkExtras, ...themeConfig.dark };
  });

  return config;
}

/**
 * Determine if a theme has dark mode enabled
 * @param theme
 */
export function hasDarkMode(theme: Theme): boolean {
  return Object.keys(theme.dark).length > 0 && Object.keys(theme.light).length > 0;
}
