const parseHTML = function parseHTML(htc) {
    const parseComponents = function parseComponents($content, subscribeToRenderEvent) {
        return $content.replace(/<(.*)\/>/g, function (match, inlineComponent) {
            const componentName = inlineComponent.split(' ')[0]
            const componentPropsString = inlineComponent.split(' ').slice(1).join(' ').trim()
            // @ts-ignore: Already included in prejs
            const componentProps = window.__webpphelpersparseprops(componentPropsString)

            // Create component
            // @ts-ignore: Already included in prejs
            const component = document.createComponent(componentName, componentProps)

            // Evaluate js when component is rendered
            subscribeToRenderEvent(() => {
                component._execJs()
                component._applyCss()
            })

            // Return component HTML
            return component.outerHTML
        })
    }

    // Render Event Listeners
    const renderEventListeners = []
    const dispatchRenderEvent = () => {
        // @ts-ignore: Yes, it can be called
        renderEventListeners.forEach(listener => listener())
    }
    const subscribeToRenderEvent = (callback) => {
        // @ts-ignore: Yes, it can be pushed
        renderEventListeners.push(callback)
    }

    // Real script
    let js = '' // Normally this would be the final js output, so we are going to evaluate it later
    let suffixJs = ''

    // Parse Components
    htc = parseComponents(htc, subscribeToRenderEvent)

    // Create Virtual DOM
    // @ts-ignore: Already included in prejs
    const vdom = new JSDOM(htc)

    // Get every element
    const elements = vdom.window.document.querySelectorAll('*')

    for (const element of elements) {
        const attrNames = element.getAttributeNames()

        for (const attrName of attrNames) {
            // Check if attribute starts with @
            if (attrName.startsWith('@')) {
                // Assign a id
                // @ts-ignore: Already included in prejs
                const uniqueElementId = `webpp-element-with-id-${__webpp_helper_gen_uuidv4.generate()}-${__webpp_helper_gen_uuidv4.generate()}`

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

    // Reactivity
    // innerHTML
    vdom.window.document.querySelector('body').innerHTML = (' ' + vdom.window.document.querySelector('body').innerHTML).replace(/([^"]){{(.*?)}}/gms, (match, c1, jsy) => {
        jsy = jsy.trim()
        // @ts-ignore: Already included in prejs
        const id = __webpp_helper_gen_uuidv4.generate()
        const jsyIsUsedAsFunction = !!jsy.match(/\((.*?)\)$/)

        suffixJs += `
                    ;(function(){
                        let __webppcurrentjsyelement = document.querySelector('[data-webpp-jsy-out-id="${id}"]');
                        let __webpp_jsy_returned = __WEBPP_CODED_eval('${btoa(jsy)}');
                        if (${jsyIsUsedAsFunction} && __WEBPP_CODED_eval('${btoa(jsy.substring(0, jsy.length - 2))}').__webpp_jsy_getter) {
                            /* It's a state */
                            __webpp_jsy_returned = __WEBPP_CODED_eval('${btoa(jsy.substring(0, jsy.length - 2))}');
                        }
                        if (__webpp_jsy_returned && typeof __webpp_jsy_returned.__webpp_jsy_getter === 'function' && typeof __webpp_jsy_returned.__webpp_jsy_setter === 'function' && typeof __webpp_jsy_returned.__webpp_jsy_effect === 'function') {
                            __webppcurrentjsyelement.innerHTML = __webpp_jsy_returned.__webpp_jsy_getter();
                            __webpp_jsy_returned.__webpp_jsy_effect(function(v,oldv){
                                __webppcurrentjsyelement.innerHTML = v;
                            });
                        } else {
                            __webppcurrentjsyelement.innerHTML = __webpp_jsy_returned;
                        }
                    })();
                `

        return `${c1}<span data-webpp-jsy-out-id="${id}"></span>`
    })
    // Attributes
    for (const element of vdom.window.document.querySelectorAll('*')) {
        const attrNames = element.getAttributeNames()

        for (const attrName of attrNames) {
            if (attrName.startsWith('bind:')) {
                // Binding!
                // @ts-ignore: Already included in prejs
                const bindingId = `webpp-binding-${__webpp_helper_gen_uuidv4.generate()}`
                const propToBindTo = attrName.substring(5)
                const stateToBindFrom = element.getAttribute(attrName)

                // Add binding id
                element.setAttribute(`data-webpp-binding-id-for-prop-${propToBindTo}`, bindingId)

                suffixJs += `
                            ;(function(){
                                let __webppcurrentbindingelement = document.querySelector('[data-webpp-binding-id-for-prop-${propToBindTo}="${bindingId}"]');
                                let __webpp_binding_returned = __WEBPP_CODED_eval('${btoa(stateToBindFrom + '()')}');
                                __webppcurrentbindingelement.setAttribute('${propToBindTo}', __webpp_binding_returned);
                                
                                /* Observe ${propToBindTo} */
                                window['____WEBPP__lastObservation_FOR_${bindingId}'] = __webpp_binding_returned;
                                setInterval(function(){
                                    if (window['____WEBPP__lastObservation_FOR_${bindingId}'] !== __webppcurrentbindingelement['${propToBindTo}']) {
                                        /* Change!!! */
                                        window['____WEBPP__lastObservation_FOR_${bindingId}'] = __webppcurrentbindingelement['${propToBindTo}'];
                                        __WEBPP_CODED_eval(btoa('${stateToBindFrom}.set(window["____WEBPP__lastObservation_FOR_${bindingId}"])'));
                                    }
                                }, 25)

                                /* Create an effect for the state */
                                ;${stateToBindFrom}.__webpp_jsy_effect(function(v,oldv){
                                    window['____WEBPP__lastObservation_FOR_${bindingId}'] = v;
                                    __webppcurrentbindingelement['${propToBindTo}'] = v;
                                });
                            })();
                        `

                // Remove attribute
                element.removeAttribute(attrName)
                continue
            }

            // Get attr value
            const attrValue = element.getAttribute(attrName)

            // Set attr
            element.setAttribute(attrName, attrValue.replace(/^{{(.*?)}}$/gms, (match, jsy) => {
                jsy = jsy.trim()
                // @ts-ignore: Already included in prejs
                const id = __webpp_helper_gen_uuidv4.generate()
                const jsyIsUsedAsFunction = !!jsy.match(/\((.*?)\)$/)

                element.setAttribute(`data-webpp-jsy-out-on-attr-for-${attrName}`, id)

                suffixJs += `
                            ;(function(){
                                let __webppcurrentjsyelement = document.querySelector('[data-webpp-jsy-out-on-attr-for-${attrName}="${id}"]');
                                let __webpp_jsy_returned = __WEBPP_CODED_eval('${btoa(jsy)}');
                                if (${jsyIsUsedAsFunction} && __WEBPP_CODED_eval('${btoa(jsy.substring(0, jsy.length - 2))}').__webpp_jsy_getter) {
                                    /* It's a state */
                                    __webpp_jsy_returned = __WEBPP_CODED_eval('${btoa(jsy.substring(0, jsy.length - 2))}');
                                }
                                if (__webpp_jsy_returned && typeof __webpp_jsy_returned.__webpp_jsy_getter === 'function' && typeof __webpp_jsy_returned.__webpp_jsy_setter === 'function' && typeof __webpp_jsy_returned.__webpp_jsy_effect === 'function') {
                                    __webppcurrentjsyelement.setAttribute("${attrName}", __webpp_jsy_returned.__webpp_jsy_getter());
                                    __webpp_jsy_returned.__webpp_jsy_effect(function(v,oldv){
                                        __webppcurrentjsyelement.setAttribute("${attrName}", v);
                                    });
                                } else {
                                    __webppcurrentjsyelement.setAttribute("${attrName}", __webpp_jsy_returned);
                                }
                            })();
                        `

                return ''
            }))
        }
    }

    // Merge js and suffixJs
    js = js + suffixJs

    // Evaluate js once rendered
    subscribeToRenderEvent(() => {
        eval(js)
    })

    // Create html from DOM
    return [`
            ${vdom.window.document.querySelector('head').innerHTML}


            ${vdom.window.document.querySelector('body').innerHTML}
    `, js, () => dispatchRenderEvent()]
}