import type { BuildEntry } from 'unbuild'
import { defineBuildConfig } from 'unbuild'

function createEntry(format: 'esm' | 'cjs') {
  return {
    input: 'src',
    builder: 'mkdist',
    format,
    ext: format === 'esm' ? 'mjs' : 'cjs',
  } as BuildEntry
}

export default defineBuildConfig({
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
})
