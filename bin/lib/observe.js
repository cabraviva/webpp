let i = 0
setTimeout(() => i = 100, 3000)

// Alert if i was changed
window['____WEBPP__lastObservation_FOR_' + 'i'] = i
setInterval(function(){
    if (window['____WEBPP__lastObservation_FOR_' + 'i'] !== i) {
        alert('i was changed from ' + window['____WEBPP__lastObservation_FOR_' + 'i'] + ' to ' + i)
        window['____WEBPP__lastObservation_FOR_' + 'i'] = i
    }
}, 20)