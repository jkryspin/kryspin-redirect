// Copies text to the clipboard, falling back to a hidden textarea on browsers
// without the async clipboard API (or when the page is not served over https).
export default function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text)
    }
    return new Promise(function (resolve, reject) {
        try {
            const holder = document.createElement('textarea')
            holder.value = text
            holder.setAttribute('readonly', '')
            holder.style.position = 'fixed'
            holder.style.opacity = '0'
            document.body.appendChild(holder)
            holder.select()
            document.execCommand('copy')
            document.body.removeChild(holder)
            resolve()
        } catch (err) {
            reject(err)
        }
    })
}
