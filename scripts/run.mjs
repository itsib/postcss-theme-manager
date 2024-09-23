import postcss from 'postcss';
import postcssThemed from '../dist/index.js';


const CSS = `
  :root {
    --color: @theme color;
  }
`;

const Themed = postcssThemed({
  config: {
    minimal: {
      light: {
        color: 'purple',
      },
      dark: {
        color: 'red',
      }
    },
    pretty: {
      light: {
        color: 'teal',
      },
      dark: {
        color: 'green',
      }
    },
  },
  defaultTheme: 'minimal',
  lightClass: '.light',
  darkClass: '.dark',
});
const PostCSS = postcss([Themed]);

async function run() {
  const result = await PostCSS.process(CSS, { from: '' });

  result.warnings().forEach(warn => console.warn(warn.toString()));

  console.log(result.css);
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
