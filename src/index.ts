import type { PluginCreator } from 'postcss';
import fs from 'fs';
import debug from 'debug';
import merge from 'deepmerge';
import * as caniuse from 'caniuse-api';
import browserslist from 'browserslist';
import { getThemeFilename, normalizeTheme, resolveThemeExtension } from './utils';
import { modernTheme } from './modern';
import { legacyTheme } from './legacy';
import type {
  ComponentTheme,
  PostcssThemeConfig,
  PostcssThemeOptions,
  ThemeResolver,
} from './types';

const log = debug('postcss-theme-manager');

/** Try to load component theme from same directory as css file */
export const configForComponent = (
  cssFile: string | undefined,
  rootTheme: PostcssThemeConfig,
  resolveTheme?: ThemeResolver
): PostcssThemeConfig | {} => {
  if (!cssFile) {
    return {};
  }

  try {
    let componentConfig: ComponentTheme | { default: ComponentTheme };

    if (resolveTheme) {
      componentConfig = resolveTheme(cssFile);
    } else {
      const theme = getThemeFilename(cssFile);
      delete require.cache[require.resolve(theme)];
      // eslint-disable-next-line security/detect-non-literal-require, global-require
      componentConfig = require(theme);
    }

    const fn = 'default' in componentConfig ? componentConfig.default : componentConfig;
    return fn(rootTheme);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      throw error;
    } else {
      log(error);
    }

    return {};
  }
};

/**
 * Define postcss-theme-manager plugin
 * @param options
 */
const AtImport: PluginCreator<PostcssThemeOptions> = (options = {}) => {
  const { config, resolveTheme } = options;
  if (!config) {
    throw Error('No config provided to postcss-theme-manager');
  }

  return {
    postcssPlugin: 'postcss-theme-manager',
    Once(root, { result }) {
      if (!root.source) {
        throw Error('No source found');
      }
      if ((root.source as any).processed) {
        return;
      }

      const globalConfig = normalizeTheme(config);
      const componentConfig = normalizeTheme(configForComponent(root.source.input.file, config, resolveTheme));
      const mergedConfig = merge(globalConfig, componentConfig);

      resolveThemeExtension(mergedConfig);

      if (caniuse.isSupported('css-variables', browserslist())) {
        modernTheme(root, mergedConfig, options);
      } else {
        legacyTheme(root, mergedConfig, options);
      }

      // @ts-ignore
      root.source.processed = true;

      if (!resolveTheme && root.source.input.file) {
        const themeFilename = getThemeFilename(root.source.input.file);

        if (fs.existsSync(themeFilename)) {
          result.messages.push({
            plugin: 'postcss-theme-manager',
            type: 'dependency',
            file: themeFilename,
          });
        }
      }
    },
    Rule() {

    }
  }
}

AtImport.postcss = true;

export { AtImport };
