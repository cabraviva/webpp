// Render components
// Components are saved in the @Components folder in the projectdir
const parseComponents = function parseComponents($content) {
    return $content.replace(/<(.*)\/>/g, function (match, inlineComponent) {
        const componentName = inlineComponent.split(' ')[0]
        const componentPropsString = inlineComponent.split(' ').slice(1).join(' ').trim()
        const componentPath = path.join(projectdir, '@Components', componentName + '.html')

        // Assign a component id
        const componentId = `webpp-${componentName.replace(/\//g, '---slash---').replace(/[^a-zA-Z0-9]/g, '-')}-component-${__webpp_helper_gen_uuidv4.generate()}`

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
        let style = (componentDOM.window.document.querySelector('style') || { innerHTML: '' }).innerHTML.trim()

        // Replace #({ PROP }) in the style with props
        style = style.replace(/#\({(.*?)}\)/g, function (_match, propKey) {
            propKey = propKey.trim()

            return componentProps[propKey]
        })

        // Get lang
        let lang = (componentDOM.window.document.querySelector('style') || {
            getAttribute() {
                return 'css'
            }
        }).getAttribute('lang') || 'css'

        if (lang === 'css') {
            // Already css, no further step required
        } else if (lang === 'sass') {
            // Convert sass to css
            const rsass = style
            const fname = path.join(pagePath, `$inlinesheet-${__webpp_helper_gen_uuidv4.generate()}.sass`)

            // Write sass to file
            fs.writeFileSync(fname, rsass)

            // Compile sass
            let compiledCss = ''
            try {
                compiledCss = sass.compile(fname).css
            } catch (e) {
                fs.unlinkSync(fname)
                throw e
            }

            // Replace style with css
            style = compiledCss

            // Remove file
            fs.unlinkSync(fname)
        } else if (lang === 'scss') {
            // Convert sass to css
            const scss = style
            const fname = path.join(pagePath, `$inlinesheet-${__webpp_helper_gen_uuidv4.generate()}.scss`)

            // Write sass to file
            fs.writeFileSync(fname, scss)

            // Compile sass
            let compiledCss = ''
            try {
                compiledCss = sass.compile(fname).css
            } catch (e) {
                fs.unlinkSync(fname)
                throw e
            }

            // Replace style with css
            style = compiledCss

            // Remove file
            fs.unlinkSync(fname)
        } else {
            // Unknown lang
            console.error(chalk.red(`Unknown stylesheet lang: ${lang}`))
        }

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