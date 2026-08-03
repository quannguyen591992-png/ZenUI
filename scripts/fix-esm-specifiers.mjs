import { readdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const root = process.argv[2]
if (!root) throw new Error('Build output directory is required')

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? javascriptFiles(path) : Promise.resolve(path.endsWith('.js') ? [path] : [])
  }))
  return files.flat()
}

for (const file of await javascriptFiles(root)) {
  const source = await readFile(file, 'utf8')
  const updated = source.replace(
    /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)(\2)/g,
    (match, prefix, quote, specifier, suffix) => (
      extname(specifier) ? match : `${prefix}${quote}${specifier}.js${suffix}`
    ),
  )
  if (updated !== source) await writeFile(file, updated, 'utf8')
}
