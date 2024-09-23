import cssesc from 'cssesc';
import path from 'node:path';

const filenameReservedRegex = /[<>:"/\\|?*\x00-\x1F]/g;
const reControlChars = /[\u0000-\u001f\u0080-\u009f]/g;
const reRelativePath = /^\.+/;

export function localizeIdentifier(resourcePath: string | undefined, localIdentName: string, name: string) {
  const interpolated = interpolateName(resourcePath, localIdentName)
    .replace(/^((-?\d)|--)/, '_$1')
    .replace(filenameReservedRegex, '-')
    .replace(reControlChars, '-')
    .replace(reRelativePath, '-')
    .replace(/\./g, '-')

  return cssesc(interpolated).replace(/\[local\]/gi, name);
}

function interpolateName(resourcePath: string | undefined, localIdentName: string) {
  let filename =  localIdentName || "[ext]";

  let ext = "bin";
  let basename = "file";
  let directory = "";
  let folder = "";
  let query = "";

  if (resourcePath) {
    const parsed = path.parse(resourcePath);

    if (parsed.ext) {
      ext = parsed.ext.slice(1);
    }

    if (parsed.dir) {
      basename = parsed.name;
      resourcePath = parsed.dir + path.sep;
    }

    directory = resourcePath.replace(/\\/g, "/").replace(/\.\.(\/)?/g, "_$1");

    if (directory.length <= 1) {
      directory = "";
    } else {
      folder = path.basename(directory);
    }
  }

  return filename
    .replace(/\[ext\]/gi, () => ext)
    .replace(/\[name\]/gi, () => basename)
    .replace(/\[path\]/gi, () => directory)
    .replace(/\[folder\]/gi, () => folder)
    .replace(/\[query\]/gi, () => query);
}
