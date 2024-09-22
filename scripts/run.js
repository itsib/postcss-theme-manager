const postcss = require('postcss');
const { postcssThemed } = require('../dist/index');

const CSS = `
  a {
    color: @theme color;
  }
`;

const Themed = postcssThemed({
  config: {
    default: {
      color: 'purple',
    },
    mint: {
      color: 'teal',
    },
  }
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
