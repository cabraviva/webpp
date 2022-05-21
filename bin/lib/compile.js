const path = require('path')
const fs = require('fs')
const YAML = require('yaml')
const minifyHTML = require('html-minifier').minify
const axios = require('axios')
const chalk = require('chalk')
const uuid = require('uuid').v4
const { JSDOM } = require('jsdom')

function scopeStyle (css, id) {
    css = css.replace(/([^\s]*)\s*{/g, (match, selector) => {
        // Add the prefix to the selector
        selector = `#${id} ${selector} {`

        return selector
    })

    return css
}

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

function parseProps (propsStr) {
    propsStr = propsStr.trim()

    const HELPER = '__WHITESPACE_HELPER_FROM_WEBPP_TO_MAKE_SURE_THAT_THERE_ARE_NO_SPACES__HASH_VALUE_______GZuiokjuhzugds8uIJHUzsu8i9djiuiUZij4hu$IJUHjiehuikajhujaikju____'

    // PROPS FORMAT: key="value" key2="value2" key3='value3'

    propsStr = propsStr.replace(/"(.*?)"/g, function (match, $inl) {
        return `"${$inl.replace(/\s/g, HELPER)}"`
    })

    propsStr = propsStr.replace(/'(.*?)'/g, function (match, $inl) {
        return `"${$inl.replace(/\s/g, HELPER)}"`
    })

    const props = {}
    const propsArr = propsStr.split(' ')
    for (const prop of propsArr) {
        const propArr = prop.split('=')
        if (propArr.length === 2) {
            props[propArr[0].trim()] = propArr[1].replace(/__WHITESPACE_HELPER_FROM_WEBPP_TO_MAKE_SURE_THAT_THERE_ARE_NO_SPACES__HASH_VALUE_______GZuiokjuhzugds8uIJHUzsu8i9djiuiUZij4hu\$IJUHjiehuikajhujaikju____/g, ' ').trim()
            props[propArr[0].trim()] = props[propArr[0].trim()].substring(1, props[propArr[0].trim()].length - 1)
        } else {
            props[propArr[0].trim()] = propArr.slice(1).join('=').replace(/__WHITESPACE_HELPER_FROM_WEBPP_TO_MAKE_SURE_THAT_THERE_ARE_NO_SPACES__HASH_VALUE_______GZuiokjuhzugds8uIJHUzsu8i9djiuiUZij4hu\$IJUHjiehuikajhujaikju____/g, ' ').trim()
            props[propArr[0].trim()] = props[propArr[0].trim()].substring(1, props[propArr[0].trim()].length - 1)
        }
    }

    return props
}

async function compilePage (pagePath, parent, projectdir) {
    // Paths
    const pageName = pagePath.substring(0, pagePath.length - 6)
    const pageIdentifier = pageName.replace(/\\/g, '/').substring(pageName.replace(/\\/g, '/').lastIndexOf('/') + 1)
    const htmlPath = pageName + '.html'
    const cssPath = pageName + '.css'
    const jsPath = pageName + '.js'

    // Outputs
    let html = ''
    let css = ''
    let js = `
    ;__MountedWebPPComponents__={};
    function __WEBPP_HELPER_mergeObjects() {
        for (var _len = arguments.length, objs = new Array(_len), _key = 0; _key < _len; _key++) {
            objs[_key] = arguments[_key];
        }

        return objs.reduce(function (acc, obj) {
            Object.keys(obj).forEach(function (key) {
            acc[key] = obj[key];
            });
            return acc;
        }, {});
    }
    `

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
        await resolveLibrary(lib, projectdir, pagePath, {
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

    // Render components
    // Components are saved in the @Components folder in the projectdir
    content = content.replace(/<(.*)\/>/g, function (match, inlineComponent) {
        const componentName = inlineComponent.split(' ')[0]
        const componentPropsString = inlineComponent.split(' ').slice(1).join(' ').trim()
        const componentPath = path.join(projectdir, '@Components', componentName + '.html')

        // Parse props
        const componentProps = parseProps(componentPropsString)

        if (!fs.existsSync(componentPath)) {
            // Component not found
            console.warn(chalk.yellow('WARNING: Component ' + componentName + ' not found. Try creating the file "' + componentPath + '"!'))
            return match
        }

        // Read component file
        let componentContent = fs.readFileSync(componentPath, 'utf8').toString('utf8')

        // Create Virtual DOM from component
        const componentDOM = new JSDOM(componentContent)

        // Assign a component id
        const componentId = `webpp-${componentName.replace(/^a-zA-Z0-9/g, '-')}-component-${uuid()}`

        // Get template
        let template = componentDOM.window.document.querySelector('template').innerHTML

        // Replace #({ PROP }) in the template with props
        template = template.replace(/#\({(.*?)}\)/g, function (_match, propKey) {
            propKey = propKey.trim()

            return componentProps[propKey]
        })

        // Get style
        let style = componentDOM.window.document.querySelector('style').innerHTML

        // Replace #({ PROP }) in the style with props
        style = style.replace(/#\({(.*?)}\)/g, function (_match, propKey) {
            propKey = propKey.trim()

            return componentProps[propKey]
        })

        // Scope the style
        style = scopeStyle(style, componentId)

        // Add the style to the css
        css += `
        /* Beginning of styles for the ${componentName} component */
        ${style}
        /* End of styles for the ${componentName} component */
        `

        let jsFromDom = componentDOM.window.document.querySelector('script').innerHTML
        let sjs = `
        /* Beginning of script for the ${componentName} component */
        ;(function _() {
            // Add component to __MountedWebPPComponents__
            ;__MountedWebPPComponents__["${componentId}"] = ${JSON.stringify({
                id: componentId,
                name: componentName,
                props: componentProps
            })};
            ;__MountedWebPPComponents__["${componentId}"].element=document.querySelector("#${componentId}");
            ;__MountedWebPPComponents__["${componentId}"].querySelector=function querySelector(selector){
                return document.querySelector("#${componentId}").querySelector(selector);
            };
            ;__MountedWebPPComponents__["${componentId}"].querySelectorAll=function querySelectorAll(selector){
                return document.querySelector("#${componentId}").querySelectorAll(selector);
            };
            ;__MountedWebPPComponents__["${componentId}"].$=__MountedWebPPComponents__["${componentId}"].querySelector;
            ;__MountedWebPPComponents__["${componentId}"].$$=__MountedWebPPComponents__["${componentId}"].querySelectorAll;
            ;__MountedWebPPComponents__["${componentId}"].define=function define(obj){
                ;__MountedWebPPComponents__["${componentId}"]=__WEBPP_HELPER_mergeObjects(__MountedWebPPComponents__["${componentId}"],obj);
                ;__MountedWebPPComponents__["${componentId}"].mounted();
            };

            // Make Component variable available
            ;let Component=__MountedWebPPComponents__["${componentId}"];

            // Real JS
            ;${jsFromDom};
        })();
        /* End of script for the ${componentName} component */
        `
        // TODO: Parse libs

        let componentHTML = `
            <div id="${componentId}">
                ${template}
            </div>
        `

        js += sjs
        return componentHTML
    })

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
        await compilePage(webppFile, parent, projectdir)
    }

    // Write global files
    for (const fileName in globalFiles) {
        await fs.promises.writeFile(path.join(projectdir, fileName), globalFiles[fileName])
    }
}

module.exports = compile