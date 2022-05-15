const path = require('path')
const fs = require('fs')
const YAML = require('yaml')
const minifyHTML = require('html-minifier').minify
const { JSDOM } = require('jsdom')

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

    // Create Virtual DOM from content
    const dom = new JSDOM(content)
    const { document } = dom.window

    // Get title element & remove every title element from content
    let title = 'Add a <title> tag to change the title'
    for (const givenTitle of document.querySelectorAll('title')) {
        title = givenTitle.innerHTML
        givenTitle.remove()
    }

    // Assign content to html from Virtual DOM
    content = document.body.innerHTML
    let shouldBeInHead = document.head.innerHTML

    // Set externalfile html
    let externalFileHTML = ''
    if (singleFile) {
        externalFileHTML = `<style>${cssContent}</style><script>${jsContent}</script>`
    } else {
        externalFileHTML = `<link rel="stylesheet" href="${pageIdentifier}.css">
        <script src="${pageIdentifier}.js"></script>`
    }

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