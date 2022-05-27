const { isValidNPMPackage, isValidURL } = require('./validationCache')
const cachify = require('./cachify')
const path = require('path')

const os = require('os')
const homedir = os.homedir()
const cacheDir = path.join(homedir, '.webpp-cache')

async function resolveLibrary(libname, projectdir, pagedir, parent) {
    if (typeof libname !== 'string') return
    if (libname.trim().length <= 0) return
    if (libname.trim() === 'undefined' || libname.trim() === 'null') return

    // If we try to resolve a library we use this steps:

    // 1. Search for the library in the registry
    const libRegistry = await cachify(cacheDir, 'lib-registry.json', 'https://raw.githubusercontent.com/greencoder001/webpp-lib/main/libs.json')
    const lib = libRegistry[libname.toLowerCase()]
    if (lib) {
        // 1.1. If the library is found, follow the steps
        for (const step of lib) {
            // 1.1.1. If the step type is FETCH_JS use parent.fetchJs()
            if (step.type === 'FETCH_JS') return parent.fetchJs(step.value)

            // 1.1.2. If the step type is FETCH_CSS use parent.fetchCss()
            if (step.type === 'FETCH_CSS') return parent.fetchCss(step.value)

            // 1.1.3. If the step type is WRITE_HEAD use parent.addHead()
            if (step.type === 'WRITE_HEAD') return parent.addHead(step.value)

            // UNKNOWN STEP TYPE
            throw new Error(`Unknown step type: ${step.type}`)
        }
    }

    const sanitizedLibName = libname.trim().replace(/@/g, '-at-').replace(/:/g, '-col-').replace(/\//g, '-slsh-').replace(/\\/g, '-bslsh-').replace(/[^a-zA-Z0-9_]/g, '')


    // 2. Check if there's an npm package with the name
    if (await isValidNPMPackage(`https://cdn.jsdelivr.net/npm/${encodeURIComponent(libname.trim())}@latest`)) {
        return parent.fetchAndDetectType(`https://cdn.jsdelivr.net/npm/${encodeURIComponent(libname.trim())}@latest`)
    }

    // 3. Try to make a web request to the library
    if (await isValidURL(libname.trim())) {
        return parent.fetchAndDetectType(libname.trim())
    }

    console.log(chalk.yellow('Warning: ') + `Library ${libname} not found`)
}

module.exports = resolveLibrary