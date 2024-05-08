import { setupGenerators } from '@rhao/plop-generators'

export default (plop) => {
  setupGenerators(plop, {
    /**
     * @type {import('@rhao/plop-generators').ConfigGeneratorOptions}
     */
    configGenerator: {
      autoInstall: true,
    },
  })
}
