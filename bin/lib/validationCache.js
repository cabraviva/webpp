const fs = require('fs')
const path = require('path')
const axios = require('axios')

const os = require('os')
const homedir = os.homedir()
const cacheDir = path.join(homedir, '.webpp-cache')
const libcachedir = path.join(cacheDir, 'libcache')
const isValidNPMPackageDir = path.join(libcachedir, '.__isvalidnpmpackage__')
const isValidURLDir = path.join(libcachedir, '.__isvalidurl__')
const contentTypeCacheDir = path.join(cacheDir, '.__contenttypecache__')

async function isValidNPMPackage(pkgurl) {
    const sanitizedPkgUrl = pkgurl.trim().replace(/@/g, '-at-').replace(/:/g, '-col-').replace(/\//g, '-slsh-').replace(/\\/g, '-bslsh-').replace(/[^a-zA-Z0-9_]/g, '')
    if (!global.validnpmpackagescache) global.isvalidnpmpackagescache = {}
    if (global.isvalidnpmpackagescache[sanitizedPkgUrl]) return global.isvalidnpmpackagescache[sanitizedPkgUrl]

    const setState = (state) => {
        global.isvalidnpmpackagescache[sanitizedPkgUrl] = state
        fs.writeFileSync(path.join(isValidNPMPackageDir, `${sanitizedPkgUrl}.time`), (new Date()).toISOString())
        fs.writeFileSync(path.join(isValidNPMPackageDir, sanitizedPkgUrl), state.toString())
    }

    if (fs.existsSync(path.join(isValidNPMPackageDir, sanitizedPkgUrl)) && fs.existsSync(path.join(isValidNPMPackageDir, `${sanitizedPkgUrl}.time`))) {
        // Already cached in fs
        const time = (await fs.promises.readFile(path.join(isValidNPMPackageDir, `${sanitizedPkgUrl}.time`))).toString()
        const timeStamp = new Date(time)

        // If the timestamp is older than 1 day, fetch again
        if (new Date().getTime() - timeStamp.getTime() > 86400000) {
            try {
                const resp = (await axios.get(pkgurl)).data
                if (resp.trim() === 'Failed to resolve the requested file.') {
                    // npm package not valid
                    setState(false)
                    return false
                } else {
                    // npm package valid
                    setState(true)
                    return true
                }
            } catch {
                // npm package not valid
                setState(false)
                return false
            }
        }

        // Return the cached value
        return fs.readFileSync(path.join(isValidNPMPackageDir, sanitizedPkgUrl)).toString() === 'true'
    } else {
        // Not cached yet, need to fetch
        try {
            const resp = (await axios.get(pkgurl)).data
            if (resp.trim() === 'Failed to resolve the requested file.') {
                // npm package not valid
                setState(false)
                return false
            } else {
                // npm package valid
                setState(true)
                return true
            }
        } catch {
            // npm package not valid
            setState(false)
            return false
        }
    }
}

async function isValidURL(url) {
    const sanitizedUrl = url.trim().replace(/@/g, '-at-').replace(/:/g, '-col-').replace(/\//g, '-slsh-').replace(/\\/g, '-bslsh-').replace(/[^a-zA-Z0-9_]/g, '')
    if (!global.validurls) global.validurls = {}
    if (global.validurls[sanitizedUrl]) return global.validurls[sanitizedUrl]

    const setState = (state) => {
        global.validurls[sanitizedUrl] = state
        fs.writeFileSync(path.join(isValidURLDir, `${sanitizedUrl}.time`), (new Date()).toISOString())
        fs.writeFileSync(path.join(isValidURLDir, sanitizedUrl), state.toString())
    }

    if (fs.existsSync(path.join(isValidURLDir, sanitizedUrl)) && fs.existsSync(path.join(isValidURLDir, `${sanitizedUrl}.time`))) {
        // Already cached in fs
        const time = (await fs.promises.readFile(path.join(isValidURLDir, `${sanitizedUrl}.time`))).toString()
        const timeStamp = new Date(time)

        // If the timestamp is older than 1 day, fetch again
        if (new Date().getTime() - timeStamp.getTime() > 86400000) {
            try {
                const resp = (await axios.get(url)).data
                if (resp.trim() === '') {
                    // URL not valid
                    setState(false)
                    return false
                } else {
                    // URL valid
                    setState(true)
                    return true
                }
            } catch {
                // URL not valid
                setState(false)
                return false
            }
        }

        // Return the cached value
        return fs.readFileSync(path.join(isValidURLDir, sanitizedUrl)).toString() === 'true'
    } else {
        // Not cached yet, need to fetch
        try {
            const resp = (await axios.get(url)).data
            if (resp.trim() === '') {
                // URL not valid
                setState(false)
                return false
            } else {
                // URL valid
                setState(true)
                return true
            }
        } catch {
            // URL not valid
            setState(false)
            return false
        }
    }
}

async function cacheContentType (url) {
    const sanitizedUrl = url.trim().replace(/@/g, '-at-').replace(/:/g, '-col-').replace(/\//g, '-slsh-').replace(/\\/g, '-bslsh-').replace(/[^a-zA-Z0-9_]/g, '')
    if (!global.contenttypescache) global.contenttypescache = {}

    // Fetching
    const doTheFetchThing = async () => {
        const response = await axios.get(url)
        const type = response.headers['content-type'].includes('css') ? 'css' : 'js'
        global.contenttypescache[sanitizedUrl] = type
        fs.writeFileSync(path.join(contentTypeCacheDir, `${sanitizedUrl}.time`), (new Date()).toISOString())
        fs.writeFileSync(path.join(contentTypeCacheDir, sanitizedUrl), type)

        return type
    }

    // Load from RAM
    if (global.contenttypescache[sanitizedUrl]) return global.contenttypescache[sanitizedUrl]

    // Load from file
    if (fs.existsSync(path.join(contentTypeCacheDir, sanitizedUrl))) {
        // Check timestamp
        const time = (await fs.promises.readFile(path.join(contentTypeCacheDir, `${sanitizedUrl}.time`))).toString('utf8')
        const timeStamp = new Date(time)

        // If the timestamp is older than 1 day, fetch again
        if (new Date().getTime() - timeStamp.getTime() > 86400000) {
            return await doTheFetchThing()
        }

        const contentType = fs.readFileSync(path.join(contentTypeCacheDir, sanitizedUrl)).toString('utf8')
        global.contenttypescache[sanitizedUrl] = contentType
        return contentType
    }

    // Fetch
    return await doTheFetchThing()
}

module.exports = {
    isValidNPMPackage,
    isValidURL,
    cacheContentType
}