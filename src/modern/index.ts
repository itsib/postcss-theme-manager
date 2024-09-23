import { decl, type Declaration, type Root, rule, type Rule } from 'postcss';
import crypto from 'node:crypto';
import fs from 'node:fs';
import get from 'dlv';
import { dset as set } from 'dset';
import { localizeIdentifier } from '../utils/localize-identifier';
import type {
  ColorScheme,
  LightDarkTheme,
  PostcssStrictThemeConfig,
  PostcssThemeOptions,
  ScopedNameFunction,
  SimpleTheme
} from '../types';
import { hasDarkMode, parseThemeKey, replaceTheme, replaceThemeRoot } from '../utils';
import { flatten } from 'flat';

/**
 * Create a CSS variable override block for a given selector
 * @param selector
 * @param theme
 * @param transform
 */
function createModernTheme(
  selector: string,
  theme: SimpleTheme,
  transform: (value: string) => string
): Rule | undefined {
  const _rule = rule({ selector });
  const flatted = flatten<SimpleTheme, Record<string, string>>(theme);

  const decls = Object
    .entries(flatted)
    .map(([prop, value]) => decl({ prop: `--${transform(prop)}`, value: `${value}` }));

  if (decls.length === 0) {
    return;
  }

  _rule.append(decls);

  return _rule;
}

/**
 * Merge a given theme with a base theme
 * @param theme
 * @param defaultTheme
 */
function mergeConfigs(theme: LightDarkTheme, defaultTheme: LightDarkTheme): LightDarkTheme {
  const merged = defaultTheme;

  for (const [colorScheme, values] of Object.entries(theme)) {
    if (!values) {
      continue;
    }

    for (const [key, value] of Object.entries(values)) {
      merged[colorScheme as ColorScheme][key] = value;
    }
  }

  return merged;
}

/**
 * Create filename
 * @param name
 * @param filePath
 * @param css
 */
function defaultLocalizeFunction(name: string, filePath: string, css: string): string {
  const hash = crypto.createHash('md5').update(css).digest('hex').slice(0, 6);
  return `${filePath || 'default'}-${name}-${hash}`;
}

function getLocalizeFunction(
  modules: string | ScopedNameFunction | undefined,
  resourcePath: string | undefined
): ((name: string) => string) {
  if (typeof modules === 'function' || modules === 'default') {
    let fileContents = '';
    if (resourcePath) {
      fileContents = fs.readFileSync(resourcePath, 'utf8');
    }

    const localize =
      typeof modules === 'function' ? modules : defaultLocalizeFunction;
    return (name: string) => {
      return localize(name, resourcePath || '', fileContents);
    };
  }

  return (name: string) => localizeIdentifier(resourcePath, modules || '[local]', name);
}

function declarationsAsString({ nodes }: Rule): string {
  if (!nodes) {
    return '';
  }

  return nodes
    .filter((node): node is Declaration => node.type === 'decl')
    .map((declaration) => `${declaration.prop}: ${declaration.value};`)
    .join('');
}

/**
 * Accomplish theming by creating CSS variable overrides
 * @param root
 * @param componentConfig
 * @param options
 */
export function modernTheme(
  root: Root,
  componentConfig: PostcssStrictThemeConfig,
  options: PostcssThemeOptions
): void {
  const usage = new Map<string, number>();
  const defaultTheme = options.defaultTheme || 'default';
  const singleTheme = options.forceSingleTheme || undefined;
  const optimizeSingleTheme = options.optimizeSingleTheme;
  const inlineRootThemeVariables = options.inlineRootThemeVariables ?? true;
  const lightClass = options.lightClass || '.light';
  const darkClass = options.darkClass || '.dark';
  const resourcePath = root.source ? root.source.input.file : '';

  const localize = (name: string) => getLocalizeFunction(options.modules, resourcePath)(name.replace(/\./g, '-'));

  const defaultThemeConfig = Object.entries(componentConfig).find(
    ([theme]) => theme === defaultTheme
  );
  const hasRootDarkMode =
    defaultThemeConfig && hasDarkMode(defaultThemeConfig[1]);

  // For single theme mode, we need to handle themes that may be incomplete
  // In that case, we merge the theme with default so all variables are present
  const singleThemeConfig = Object.entries(componentConfig).find(
    ([theme]) => theme === singleTheme
  );

  let mergedSingleThemeConfig = defaultThemeConfig
    ? defaultThemeConfig[1]
    : { light: {}, dark: {} };

  if (defaultThemeConfig && singleThemeConfig && defaultTheme !== singleTheme) {
    mergedSingleThemeConfig = mergeConfigs(
      singleThemeConfig[1],
      defaultThemeConfig[1]
    );
  }

  const hasMergedDarkMode =
    mergedSingleThemeConfig && hasDarkMode(mergedSingleThemeConfig);

  // 1a. walk again to optimize inline default values
  root.walkRules((rule) => {
    rule.selector = replaceThemeRoot(rule.selector);

    rule.walkDecls((decl) => {
      decl.value.split(/(?=@theme)/g).forEach((chunk) => {
        const key = parseThemeKey(chunk);

        if (key) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const count = usage.has(key) ? usage.get(key)! + 1 : 1;
          usage.set(key, count);
        }
      });
    });
  });

  // 1b. Walk each declaration and replace theme vars with CSS vars
  root.walkRules((rule) => {
    rule.selector = replaceThemeRoot(rule.selector);

    rule.walkDecls((decl) => {
      let key = parseThemeKey(decl.value);

      while (key) {
        const themeValue = get(mergedSingleThemeConfig.light, key);

        if (singleTheme && !hasMergedDarkMode && optimizeSingleTheme) {
          // If we are only building a single theme with light mode, we can optionally insert the value
          if (themeValue) {
            decl.value = replaceTheme(decl.value, themeValue);
          } else {
            root.warn(
              root.toResult(),
              `Could not find key ${key} in theme configuration. Removing declaration.`,
              { node: decl }
            );
            decl.remove();
            break;
          }
        } else if (key && !themeValue) {
          throw decl.error(
            `Could not find key ${key} in theme configuration.`,
            { word: decl.value }
          );
        } else if (
          inlineRootThemeVariables &&
          usage.has(key) &&
          usage.get(key) === 1
        ) {
          decl.value = replaceTheme(
            decl.value,
            `var(--${localize(key)}, ${themeValue})`
          );
        } else if (key) {
          decl.value = replaceTheme(decl.value, `var(--${localize(key)})`);
        } else {
          throw decl.error(`Invalid theme usage: ${decl.value}`, {
            word: decl.value,
          });
        }

        key = parseThemeKey(decl.value);
      }

      if (decl.value.match(/@theme/g) || decl.value.match(/theme\s+\(['"]/g)) {
        throw decl.error(`Invalid theme usage: ${decl.value}`, {
          word: decl.value,
        });
      }
    });
  });

  // 2. Create variable declaration blocks
  const filterUsed = (
    colorScheme: ColorScheme,
    theme: string | LightDarkTheme,
    filterFunction = (name: string) => usage.has(name)
  ): SimpleTheme => {
    const themeConfig =
      typeof theme === 'string' ? componentConfig[theme] : theme;
    const currentThemeConfig = themeConfig[colorScheme];
    const usedVariables: SimpleTheme = {};

    Array.from(usage.keys()).forEach((key) => {
      const value = get(currentThemeConfig, key);

      if (value && filterFunction(key) && typeof value !== 'object') {
        // If the dark and light theme have the same value don't include
        if (theme === defaultTheme) {
          if (colorScheme === 'dark' && get(themeConfig.light, key) === value) {
            return;
          }
        }

        // If the theme value matches the base theme don't include
        if (
          defaultThemeConfig &&
          typeof theme === 'string' &&
          theme !== defaultTheme &&
          get(defaultThemeConfig[1][colorScheme], key) === value
        ) {
          return;
        }

        set(usedVariables, key, value);
      }
    });

    return usedVariables;
  };

  const addRootTheme = (themeConfig: LightDarkTheme) => {
    // If inlineRootThemeVariables then only add vars to root that are used more than once
    const func = inlineRootThemeVariables
      ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (name: string) => usage.has(name) && usage.get(name)! > 1
      : undefined;

    return createModernTheme(
      ':root',
      filterUsed('light', themeConfig, func),
      localize
    );
  };

  // 2a. If generating a single theme, simply generate the default
  if (singleTheme) {
    const rules: (Rule | undefined)[] = [];
    const rootRules = addRootTheme(mergedSingleThemeConfig);

    if (hasMergedDarkMode) {
      rules.push(
        createModernTheme(
          darkClass,
          filterUsed('dark', mergedSingleThemeConfig),
          localize
        )
      );
      rules.push(rootRules);
    }

    if (!optimizeSingleTheme) {
      rules.push(rootRules);
    }

    root.append(...rules.filter((x): x is Rule => Boolean(x)));
    return;
  }

  const rules: (Rule | undefined)[] = [];

  // 2b. Under normal operation, generate CSS variable blocks for each theme
  Object.entries(componentConfig).forEach(([theme, themeConfig]) => {
    if (theme === defaultTheme) {
      rules.push(addRootTheme(themeConfig));
      rules.push(
        createModernTheme(darkClass, filterUsed('dark', defaultTheme), localize)
      );
    } else if (hasDarkMode(themeConfig)) {
      rules.push(
        createModernTheme(
          `.${theme}${lightClass}`,
          filterUsed('light', theme),
          localize
        ),
        createModernTheme(
          `.${theme}${darkClass}`,
          filterUsed('dark', theme),
          localize
        )
      );
    } else {
      rules.push(
        createModernTheme(
          hasRootDarkMode ? `.${theme}${lightClass}` : `.${theme}`,
          filterUsed('light', theme),
          localize
        )
      );
    }
  });

  const definedRules: Rule[] = [];

  rules.forEach((rule) => {
    if (!rule) {
      return;
    }

    const defined = definedRules.find(
      (definedRule) =>
        declarationsAsString(definedRule) === declarationsAsString(rule)
    );

    if (defined) {
      defined.selector += `,${rule.selector}`;
    } else {
      definedRules.push(rule);
    }
  });

  root.append(...definedRules);
}
