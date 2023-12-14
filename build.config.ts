import { defineBuildConfig } from 'unbuild'
import type { BuildEntry } from 'unbuild'

function createEntry(format: 'esm' | 'cjs') {
  return {
    input: 'src',
    builder: 'mkdist',
    format,
    ext: format === 'esm' ? 'mjs' : 'cjs',
    esbuild: {
      define: {
        'import.meta.vitest': 'false',
      },
      minifySyntax: true,
    },
  } as BuildEntry
}

export default defineBuildConfig([
  {
    entries: [createEntry('esm'), createEntry('cjs')],
    clean: true,
    declaration: true,
    failOnWarn: false,
    rollup: {
      emitCJS: true,
      dts: {
        compilerOptions: {
          noEmitOnError: false,
        },
      },
    },
  },
])
