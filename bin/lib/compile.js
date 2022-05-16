const path = require('path')
const fs = require('fs')
const YAML = require('yaml')
const minifyHTML = require('html-minifier').minify
const axios = require('axios')
const { JSDOM } = require('jsdom')

async function resolveLibrary (libname, projectdir, pagedir, parent) {
    // If we try to resolve a library we use this steps:

    // 1. Search for the library in the registry
    const libRegistry = (await axios.get('https://raw.githubusercontent.com/greencoder001/webpp-lib/main/libs.json')).data
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

    // 2. Check if there's an npm package with the name
    try {
        const npmResp = (await axios.get(`https://cdn.jsdelivr.net/npm/${encodeURIComponent(libname.trim())}@latest`)).data
        if (npmResp.trim() === 'Failed to resolve the requested file.') {
            // npm package not found
        } else {
            // npm package found
            // Add as fetchJs
            return parent.fetchJs(`https://cdn.jsdelivr.net/npm/${encodeURIComponent(libname.trim())}@latest`)
        }
    } catch {
        // npm package not found
    }

    // 3. Try to make a web request to the library
    try {
        const resp = (await axios.get(libname.trim())).data
        return parent.fetchAndDetectType(libname.trim())
    }
    catch {
        // Library not found
    }
}

async function isWebppFolder (filepath, webppFolders) {
    const stat = await fs.promises.stat(filepath)
    if (stat.isDirectory()) {
        if (filepath.endsWith('.webpp')) {
            webppFolders.push(filepath)
        }

        let $webppFolders = await getWebppFolders(filepath)
        for (const $webppFolder of $webppFolders) {
            await isWebppFolder($webppFolder, webppFolders)
        }
    }
}

async function getWebppFolders (projectdir) {
    const webppFolders = []
    const files = await fs.promises.readdir(projectdir)
    for (const file of files) {
        const filepath = path.join(projectdir, file)
        await isWebppFolder(filepath, webppFolders)
    }
    return webppFolders
}

async function compilePage (pagePath, parent) {
    // Paths
    const pageName = pagePath.substring(0, pagePath.length - 6)
    const pageIdentifier = pageName.replace(/\\/g, '/').substring(pageName.replace(/\\/g, '/').lastIndexOf('/') + 1)
    const htmlPath = pageName + '.html'
    const cssPath = pageName + '.css'
    const jsPath = pageName + '.js'

    // Outputs
    let html = ''
    let css = ''
    let js = ''

    // Read files
    let manifest = ''
    let content = ''
    let cssContent = ''
    let jsContent = ''
    let sassContent = ''
    let tsContent = ''

    try { manifest = (await fs.promises.readFile(path.join(pagePath, '.yaml'), 'utf8')).toString('utf8') } catch (_e) {}
    try { content = (await fs.promises.readFile(path.join(pagePath, 'index.html'), 'utf8')).toString('utf8') } catch (_e) {}
    try { cssContent = (await fs.promises.readFile(path.join(pagePath, 'style.css'), 'utf8')).toString('utf8') } catch (_e) {}
    try { jsContent = (await fs.promises.readFile(path.join(pagePath, 'script.js'), 'utf8')).toString('utf8') } catch (_e) {}
    try { sassContent = (await fs.promises.readFile(path.join(pagePath, 'style.sass'), 'utf8')).toString('utf8') } catch (_e) {}
    try { tsContent = (await fs.promises.readFile(path.join(pagePath, 'script.ts'), 'utf8')).toString('utf8') } catch (_e) {}

    // Parse manifest
    manifest = YAML.parse(manifest)
    if (typeof manifest !== 'object') throw new Error(`Invalid manifest in ${pagePath}`)
    if (!Array.isArray(manifest.use)) manifest.use = [ manifest.use ]
    const singleFile = manifest.singleFile || false

    // Embed libraries
    let libHead = ''
    let mjs = ''
    for (const lib of manifest.use) {
        await resolveLibrary(lib, pagePath, pagePath, {
            fetchJs: async (url) => {
                const response = await axios.get(url)
                mjs += `
                /* Beginning of ${lib} which was fetched from ${url} at ${new Date()} */
                ;(function m(){

                ${response.data}

                })();
                /* End of ${lib} */
                `
            },
            fetchCss: async (url) => {
                const response = await axios.get(url)
                css += `
                /* Beginning of ${lib} which was fetched from ${url} at ${new Date()} */
                ${response.data}
                /* End of ${lib} */
                `
            },
            fetchAndDetectType: async (url) => {
                const response = await axios.get(url)
                const type = response.headers['content-type'] === 'text/css' ? 'css' : 'js'
                if (type === 'js') {
                    mjs += `
                    /* Beginning of ${lib} which was fetched from ${url} at ${new Date()} */
                    ;(function m(){

                    ${response.data}

                    })();
                    /* End of ${lib} */
                    `
                } else if (type === 'css') {
                    css += `
                    /* Beginning of ${lib} which was fetched from ${url} at ${new Date()} */
                    ${response.data}
                    /* End of ${lib} */
                    `
                }
            },
            addHead: (htmlToWriteToHead) => {
                libHead += `
                <!-- Beginning of ${lib} which was added to head at ${new Date()} -->
                ${htmlToWriteToHead}
                <!-- End of ${lib} -->
                `
            }
        })
    }

    // Create Virtual DOM from content
    const dom = new JSDOM(content)
    const { document } = dom.window

    // Get title element & remove every title element from content
    let title = 'Add a <title> tag to change the title'
    for (const givenTitle of document.querySelectorAll('title')) {
        title = givenTitle.innerHTML
        givenTitle.remove()
    }

    // Get style emlements & remove every style element from content
    for (const styleElem of document.querySelectorAll('style')) {
        css += `
        /* Beginning of an inline style element which was added to head at ${new Date()} */
        ${styleElem.innerHTML}
        /* End of an inline style element */
        `
        styleElem.remove()
    }

    // Get script elements & remove every script element from content
    for (const scriptElem of document.querySelectorAll('script')) {
        // If the script has no src attribute, it is inline
        if (!scriptElem.hasAttribute('src')) {
            js += `
            /* Beginning of an inline script element which was added to head at ${new Date()} */
            ${scriptElem.innerHTML}
            /* End of an inline script element */
            `

            scriptElem.remove()
        } else {
            // If the script has a src attribute, it is external
            const src = scriptElem.getAttribute('src')
            if (src.endsWith('.ts')) {
                js += `
                /* Beginning of an external script element which was added to head at ${new Date()} */
                ;(function m(){

                ${await fs.promises.readFile(path.join(pagePath, src), 'utf8')}

                })();
                /* End of an external script element */
                `
            } else {
                js += `
                /* Beginning of an external script element which was added to head at ${new Date()} */
                ;(function m(){

                ${await fs.promises.readFile(path.join(pagePath, src), 'utf8')}

                })();
                /* End of an external script element */
                `
            }

            scriptElem.remove()
        }
    }

    // Assign content to html from Virtual DOM
    content = document.body.innerHTML
    let shouldBeInHead = document.head.innerHTML

    // Set externalfile html
    let externalFileHTML = ''
    if (singleFile) {
        externalFileHTML = `<style>${cssContent}</style><script defer>${jsContent}</script>`
    } else {
        externalFileHTML = `<link rel="stylesheet" href="${pageIdentifier}.css">
        <script defer src="${pageIdentifier}.js"></script>`
    }

    // Add jsContent to js
    js += jsContent

    // Merge mjs and js
    js = mjs + js

    // Minify js
    js = minifyHTML(`<script>${js}</script>`, {
        collapseWhitespace: true,
        minifyJS: true
    })
    js = js.substring(8, js.length - 9)

    // Add cssContent to css
    css += cssContent

    // Minify css
    css = minifyHTML(`<style>${css}</style>`, {
        collapseWhitespace: true,
        minifyCSS: true
    }).replace('<style>', '').replace('</style>', '')

    // Create HTML
    html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>

        <!-- External files -->
        ${externalFileHTML}

        <!-- Head from Virtual DOM -->
        ${shouldBeInHead}

        <!-- Embedded libraries -->
        ${libHead}
    </head>
    <body>
        ${content}
    </body>
    </html>
    `

    // Minify HTML
    html = minifyHTML(html, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true
    })

    // Write outputs
    if (singleFile) {
        await fs.promises.writeFile(htmlPath, html)
    } else {
        await fs.promises.writeFile(htmlPath, html)
        await fs.promises.writeFile(cssPath, css)
        await fs.promises.writeFile(jsPath, js)
    }
}

async function compile (argvString) {
    const projectdir = path.isAbsolute(argvString) ? path.normalize(argvString) : path.normalize(path.join(process.cwd(), path.normalize(argvString)))
    
    // Recursively get all paths of folders that end with '.webpp'
    const webppFolders = await getWebppFolders(projectdir)

    // Global files
    const globalFiles = {
        // Global files are used to include frameworks, libraries, etc. without having to save them for every page
        // filename: content
    }

    // Set parent
    const parent = {
        pushGlobalFile: (fileName, fileContent) => {
            globalFiles[fileName] = fileContent
        }
    }

    // Compile every single page
    for (const webppFile of webppFolders) {
        await compilePage(webppFile, parent)
    }

    // Write global files
    for (const fileName in globalFiles) {
        await fs.promises.writeFile(path.join(projectdir, fileName), globalFiles[fileName])
    }
}

module.exports = compile