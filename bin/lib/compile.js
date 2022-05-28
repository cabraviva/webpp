const path = require('path')
const fs = require('fs')
const YAML = require('yaml')
const minifyHTML = require('html-minifier').minify
const axios = require('axios')
const chalk = require('chalk')
const uuid = require('uuid').v4
const { JSDOM } = require('jsdom')
const sass = require('node-sass')
const babel = require('@babel/core')
const parseTypeScript = require('./parseTypeScript')
const scopeStyle = require('./scopeStyle')
const { parseProps, stringifyProps } = require('./props-parser')
const { getWebppFolders } = require('./webpp-folder')
const { cacheContentType } = require('./validationCache')
const resolveLibrary = require('./resolve-lib')

const os = require('os')
const homedir = os.homedir()
const cacheDir = path.join(homedir, '.webpp-cache')
const libcachedir = path.join(cacheDir, 'libcache')
const fetchedJsDir = path.join(libcachedir, '.__fetchedjs__')
const fetchedCssDir = path.join(libcachedir, '.__fetchedcss__')
const isValidNPMPackageDir = path.join(libcachedir, '.__isvalidnpmpackage__')
const isValidURLDir = path.join(libcachedir, '.__isvalidurl__')
const contentTypeCacheDir = path.join(cacheDir, '.__contenttypecache__')
const fetchedAndDetectedDir = path.join(libcachedir, '.__fetched__and__detected__')
const cachify = require('./cachify')

if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir)
if (!fs.existsSync(libcachedir)) fs.mkdirSync(libcachedir)
if (!fs.existsSync(fetchedJsDir)) fs.mkdirSync(fetchedJsDir)
if (!fs.existsSync(fetchedCssDir)) fs.mkdirSync(fetchedCssDir)
if (!fs.existsSync(isValidNPMPackageDir)) fs.mkdirSync(isValidNPMPackageDir)
if (!fs.existsSync(isValidURLDir)) fs.mkdirSync(isValidURLDir)
if (!fs.existsSync(contentTypeCacheDir)) fs.mkdirSync(contentTypeCacheDir)
if (!fs.existsSync(fetchedAndDetectedDir)) fs.mkdirSync(fetchedAndDetectedDir)

async function compilePage (pagePath, parent, projectdir, compilerOptions = { dev: false }) {
    // Do not compile if already compiling
    if (!global.currentCompilingPages) global.currentCompilingPages = {}
    if (global.currentCompilingPages[pagePath]) return false
    global.currentCompilingPages[pagePath] = true
    
    // Required options
    if (typeof compilerOptions !== 'object') throw new TypeError('compilerOptions must be an object')
    
    // Default options
    if (typeof compilerOptions.dev !== 'boolean') compilerOptions.dev = false
    if (typeof compilerOptions.minify !== 'boolean') compilerOptions.minify = !compilerOptions.dev

    const startTimeStamp = Date.now()

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
    ;window.__MountedWebPPComponents__={};
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
    let tsContent = ''

    try { manifest = (await fs.promises.readFile(path.join(pagePath, '.yaml'), 'utf8')).toString('utf8') } catch (_e) {}
    try { content = (await fs.promises.readFile(path.join(pagePath, 'index.html'), 'utf8')).toString('utf8') } catch (_e) {}
    try { cssContent = (await fs.promises.readFile(path.join(pagePath, 'style.css'), 'utf8')).toString('utf8') } catch (_e) {}
    try { jsContent = (await fs.promises.readFile(path.join(pagePath, 'script.js'), 'utf8')).toString('utf8') } catch (_e) {}
    try { tsContent = (await fs.promises.readFile(path.join(pagePath, 'script.ts'), 'utf8')).toString('utf8') } catch (_e) {}

    // Parse SASS
    if (fs.existsSync(path.join(pagePath, 'style.sass'))) {
        const parsedSass = sass.renderSync({
            file: path.join(pagePath, 'style.sass')
        }).css

        css += `
        /* CSS parsed from style.sass */
        ${parsedSass}
        /* ########### End ########## */
        `
    }

    // Parse SCSS
    if (fs.existsSync(path.join(pagePath, 'style.scss'))) {
        const parsedScss = sass.renderSync({
            file: path.join(pagePath, 'style.scss')
        }).css

        css += `
        /* CSS parsed from style.scss */
        ${parsedScss}
        /* ########### End ########## */
        `
    }

    // Parse manifest
    manifest = YAML.parse(manifest)
    if (!manifest) manifest = {}
    if (typeof manifest !== 'object') throw new Error(`Invalid manifest in ${pagePath}`)
    if (!Array.isArray(manifest.use)) manifest.use = [ manifest.use ]
    const singleFile = manifest.singleFile || false

    // Language
    const pageLang = manifest.lang || manifest.language || 'en'

    // Embed libraries
    let libHead = ''
    let mjs = ''
    let libsToInclude = manifest.use || []

    // Render components
    // Components are saved in the @Components folder in the projectdir
    function parseComponents ($content) {
        return $content.replace(/<(.*)\/>/g, function (match, inlineComponent) {
            const componentName = inlineComponent.split(' ')[0]
            const componentPropsString = inlineComponent.split(' ').slice(1).join(' ').trim()
            const componentPath = path.join(projectdir, '@Components', componentName + '.html')

            // Assign a component id
            const componentId = `webpp-${componentName.replace(/\//g, '---slash---').replace(/[^a-zA-Z0-9]/g, '-')}-component-${uuid()}`

            // Parse props
            const componentProps = parseProps(componentPropsString)

            if (!fs.existsSync(componentPath)) {
                // Component not found
                console.warn(chalk.yellow('WARNING: Component ' + componentName + ' not found. Try creating the file "' + componentPath + '"!'))
                return match
            }

            // Read component file
            let componentContent = fs.readFileSync(componentPath, 'utf8').toString('utf8')

            // Define Component value in @event listeners
            componentContent = componentContent.replace(/<(.*?) (.*?)>/g, (match, elemName, elemProps) => {
                const elemPropsObj = parseProps(elemProps)
                let needToReAssignProps = false
                
                for (const elemPropsKey of Object.keys(elemPropsObj)) {
                    if (elemPropsKey.startsWith('@')) {
                        elemPropsObj[elemPropsKey] = `let Component=__MountedWebPPComponents__['${componentId}'];${elemPropsObj[elemPropsKey]}`.replace(/"/g, '\'')
                        needToReAssignProps = true
                    }
                }

                if (needToReAssignProps) {
                    return `<${elemName} ${stringifyProps(elemPropsObj)}>`
                }

                return match	
            })

            // Parse other components
            componentContent = parseHTML_(componentContent)

            // Create Virtual DOM from component
            const componentDOM = new JSDOM(componentContent)

            // Get style
            let style = (componentDOM.window.document.querySelector('style') || { innerHTML: '' }).innerHTML

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

            let jsFromDom = (componentDOM.window.document.querySelector('script') || { innerHTML: '' }).innerHTML
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

            // Get template
            let template = (componentDOM.window.document.querySelector('template') || { innerHTML: '<h1>Add a template tag to display content!</h1>' }).innerHTML

            // Replace #({ PROP }) in the template with props
            template = template.replace(/#\({(.*?)}\)/g, function (_match, propKey) {
                propKey = propKey.trim()

                return componentProps[propKey]
            })

            // Parse libs
            let componentLibs = []
            if (componentDOM.window.document.querySelector('libs') && componentDOM.window.document.querySelector('libs').innerHTML) {
                componentLibs = (componentDOM.window.document.querySelector('libs') || { innerHTML: '' }).innerHTML.trim().split(',').map(e => e.trim())
            }
            if (!Array.isArray(componentLibs)) componentLibs = [componentLibs]
            libsToInclude = libsToInclude.concat(componentLibs)

            let componentHTML = `
                <div id="${componentId}">
                    ${template}
                </div>
            `

            js += sjs
            return componentHTML
        })
    }

    function parseHTML_(htc) {
        // Parse Components
        htc = parseComponents(htc)

        // Create Virtual DOM
        const vdom = new JSDOM(htc)

        // Get every element
        const elements = vdom.window.document.querySelectorAll('*')

        for (const element of elements) {
            const attrNames = element.getAttributeNames()

            for (const attrName of attrNames) {
                // Check if attribute starts with @
                if (attrName.startsWith('@')) {
                    // Assign a id
                    const uniqueElementId = `webpp-element-with-id-${uuid()}-${uuid()}`

                    // Add the id to the element as [data-webpp-element-id]
                    element.setAttribute(`data-webpp-element-id`, uniqueElementId)

                    // Add js for the event listener
                    js += `
                    /* Begin JS for event listener ${attrName} */
                    ;(function _(){
                        // Get the element
                        let __webppcelement=document.querySelector("[data-webpp-element-id='${uniqueElementId}']");
                        // Add event listener
                        __webppcelement.addEventListener("${attrName.substring(1)}",function(event){
                            ;let target=__webppcelement;
                            ;${element.getAttribute(attrName)};
                        });
                    }).bind(window)();
                    /* End JS for event listener ${attrName} */
                    `

                    // Remove the attribute
                    element.removeAttribute(attrName)

                }
            }
        }

        // Create html from DOM
        return `
        ${vdom.window.document.querySelector('head').innerHTML}


        ${vdom.window.document.querySelector('body').innerHTML}
        `
    }

    content = parseHTML_(content)


    // Make sure every element in libs is unique & fetch libs
    libsToInclude = [...new Set(libsToInclude)]
    for (let lib of libsToInclude) {
        lib = `${lib}`.trim()

        await resolveLibrary(lib, projectdir, pagePath, {
            fetchJs: async (url) => {
                const sanitizedURL = url.trim().replace(/@/g, '-at-').replace(/:/g, '-col-').replace(/\//g, '-slsh-').replace(/\\/g, '-bslsh-').replace(/[^a-zA-Z0-9_]/g, '')
                const fetched = await cachify(fetchedJsDir, sanitizedURL, url)
                mjs += `
                /* Beginning of ${lib} which was fetched from ${url} at ${new Date()} */
                ;((function m(){

                ${fetched}

                }).bind(window))();
                /* End of ${lib} */
                `
            },
            fetchCss: async (url) => {
                const sanitizedURL = url.trim().replace(/@/g, '-at-').replace(/:/g, '-col-').replace(/\//g, '-slsh-').replace(/\\/g, '-bslsh-').replace(/[^a-zA-Z0-9_]/g, '')
                const fetched = await cachify(fetchedCssDir, sanitizedURL, url)
                css += `
                /* Beginning of ${lib} which was fetched from ${url} at ${new Date()} */
                ${fetched}
                /* End of ${lib} */
                `
            },
            fetchAndDetectType: async (url) => {
                const type = await cacheContentType(url)
                const sanitizedURL = url.trim().replace(/@/g, '-at-').replace(/:/g, '-col-').replace(/\//g, '-slsh-').replace(/\\/g, '-bslsh-').replace(/[^a-zA-Z0-9_]/g, '')
                const response = await cachify(fetchedAndDetectedDir, `__FADCACHE__${sanitizedURL}`, url)

                if (type === 'js') {
                    mjs += `
                    /* Beginning of ${lib} which was fetched from ${url} at ${new Date()} */
                    ;(function m(){

                    ${response}

                    }).bind(window)();
                    /* End of ${lib} */
                    `
                } else if (type === 'css') {
                    css += `
                    /* Beginning of ${lib} which was fetched from ${url} at ${new Date()} */
                    ${response}
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

                ${parseTypeScript(await fs.promises.readFile(path.join(pagePath, src), 'utf8'), src, pagePath)}

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

    // Add tsContent to js
    js += parseTypeScript(tsContent, 'script.ts', pagePath)

    // Add jsContent to js
    js += jsContent

    // Merge mjs and js
    js = mjs + js

    // Use Babel to transpile js
    if (!compilerOptions.dev) {
        // Don't transpile in dev mode
        js = babel.transformSync(js, {
            presets: [
                '@babel/preset-env'
            ],
            cwd: pagePath
        }).code
    }

    // Minify js
    if (compilerOptions.minify) {
        js = minifyHTML(`<script>${js}</script>`, {
            collapseWhitespace: true,
            minifyJS: true
        })
        js = js.substring(8, js.length - 9)
    }
    

    // Add cssContent to css
    css += cssContent

    // Minify css
    if (compilerOptions.minify) {
        css = minifyHTML(`<style>${css}</style>`, {
            collapseWhitespace: true,
            minifyCSS: true
        }).replace('<style>', '').replace('</style>', '')
    }

    // Combine repeating css into one css block
    // a {color:#fff}h1{color:#fff} => a,h1{color:#fff}
    let repeatingCssBlocks = {
        // cssBlock: [...selectors]
    }

    css = css.replace(/(.*?){(.*?)}/g, (match, selector, cssBlock) => {
        if (!repeatingCssBlocks[cssBlock.trim()]) repeatingCssBlocks[cssBlock.trim()] = []
        repeatingCssBlocks[cssBlock.trim()].push(selector)

        return ''
    })

    for (const cssBlock in repeatingCssBlocks) {
        repeatingCssBlocks[cssBlock] = [...new Set(repeatingCssBlocks[cssBlock])]

        const selectors = repeatingCssBlocks[cssBlock].join(',')
        css += `${selectors}{${cssBlock}}`
    }


    // Singlefile
    if (singleFile) {
        externalFileHTML = `<style>${css}</style><script defer>${js}</script>`
    } else {
        externalFileHTML = `<link rel="stylesheet" href="${pageIdentifier}.css">
        <script defer src="${pageIdentifier}.js"></script>`
    }

    // Dev scripts to inject
    let devScripts = ''
    if (compilerOptions.dev) {
        // Start live reload server if not already started
        if (!global.liveReloadServer) {
            // deepcode ignore HttpToHttps: No need to use HTTPS for a Dev Server
            const http = require('http')
            const WebSocketServer = require('websocket').server
            const server = http.createServer()
            const serverPort = 989 + Math.floor(Math.random() * 1000)
            server.listen(serverPort)

            const wsServer = new WebSocketServer({
                httpServer: server
            })

            global.liveReloadServer = {
                httpServer: server,
                wsServer,
                serverPort,
                connections: [],
                sendData (data) {
                    for (const connection of global.liveReloadServer.connections) {
                        connection.sendUTF(JSON.stringify(data))
                    }
                }
            }

            wsServer.on('request', function (request) {
                const connection = request.accept(null, request.origin)

                global.liveReloadServer.connections.push(connection)

                global.liveReloadServer.sendData({ hi: true })

                connection.on('close', function (reasonCode, description) {
                    // Client just disconnected
                })
            })
        }

        // Inject live reload
        devScripts += `
            <script defer>
                const _ws = new WebSocket("ws://localhost:${global.liveReloadServer.serverPort}/");

                _ws.onopen = function() {
                    console.log("[Webpp] Live-Reload activated");
                };

                _ws.onmessage = function(e) {
                    var data = JSON.parse(e.data);
                    
                    if (data.action === "PAGE_RELOAD") {
                        setTimeout(function rlPage(){
                            location.reload();
                        },200);
                    } else if (data.action === "CONSOLE_LOG") {
                        console.log(data.message);
                    }
                };
            </script>
        `
    }

    // Create HTML
    html = `
    <!DOCTYPE html>
    <html lang="${pageLang}">
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

        <!-- Injected dev scripts -->
        ${devScripts}
    </head>
    <body>
        <noscript>
            <div style="font-family:sans-serif;position:fixed;z-index:1000000;top:0;left:0;width:100vw;height:100vh;background:#000;color:#fff;display:flex;justify-content:center;align-items:center;text-align:center;">
                <h1>${(pageLang.includes('de') || pageLang.includes('german')) ? 'Bitte aktivieren Sie Javascript in Ihrem Browser, um diese Seite anzuzeigen!' : 'Please enable Javascript in your browser to view this page!'}</h1>
            </div>
        </noscript>
        ${content}
    </body>
    </html>
    `

    // Minify HTML
    if (compilerOptions.minify) {
        html = minifyHTML(html, {
            collapseWhitespace: true,
            removeComments: true,
            minifyCSS: true,
            minifyJS: true
        })
    }

    // Write outputs
    if (singleFile) {
        await fs.promises.writeFile(htmlPath, html)
    } else {
        await fs.promises.writeFile(htmlPath, html)
        await fs.promises.writeFile(cssPath, css)
        await fs.promises.writeFile(jsPath, js)
    }

    global.currentCompilingPages[pagePath] = false
    
    const timeSinceStartInMs = Date.now() - startTimeStamp

    console.log(chalk.green(`Compiled ${chalk.yellow(pagePath.replace(/\\/g, '/').split('/')[pagePath.replace(/\\/g, '/').split('/').length - 1].substring(0, pagePath.replace(/\\/g, '/').split('/')[pagePath.replace(/\\/g, '/').split('/').length - 1].length - 6))} in ${chalk.yellow(timeSinceStartInMs / 1000 + 's')}`))

    // Reload page if in Dev Mode
    if (compilerOptions.dev) {
        global.liveReloadServer.sendData({
            action: 'PAGE_RELOAD'
        })
    }

    return true
}

async function compile (argvString, compilerOptions, pagesToReCompile) {
    let finalCompileResult = true

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
        // Skip if not in pagesToReCompile

        const doTheCompilation = async () => {
            const compileresult = await compilePage(webppFile, parent, projectdir, compilerOptions)
            if (compileresult === false) finalCompileResult = false
        }

        if (pagesToReCompile === '*') {
            await doTheCompilation()
            continue
        }

        if (!pagesToReCompile.some(x => x.includes(webppFile))) {
            continue
        }

        await doTheCompilation()        
    }

    // Write global files
    for (const fileName in globalFiles) {
        await fs.promises.writeFile(path.join(projectdir, fileName), globalFiles[fileName])
    }

    return finalCompileResult
}

module.exports = compile