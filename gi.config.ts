import { defineConfig } from '@rhao/gen-index'

export default defineConfig({
  outFile: 'index.ts',
  dirs: [{ input: 'src', exclude: ['utils'] }, 'src/plugins'],
  onlyDirectories: true,
  include: ['*'],
})
