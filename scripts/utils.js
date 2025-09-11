class Utils {
    constructor(printId) {
        this.printId = printId;
    }

    /**
     * Imprime mensajes en consola y en la página (si existe el elemento printId).
     */
    printError(err) {
        console.error(err);
        if (this.printId) {
            const element = document.getElementById(this.printId);
            if (element) {
                element.innerHTML = `<div class="alert alert-danger" role="alert"><i class="bi bi-exclamation-triangle"></i> ${err}</div>`;
            }
        }
    }

    printMessage(msg, type = 'info') {
        console.log(msg);
        if (this.printId) {
            const element = document.getElementById(this.printId);
            if (element) {
                let icon = 'bi-info-circle';
                if (type === 'success') icon = 'bi-check-circle';
                else if (type === 'warning') icon = 'bi-exclamation-triangle';
                
                element.innerHTML = `<div class="alert alert-${type}" role="alert"><i class="${icon}"></i> ${msg}</div>`;
            }
        }
    }

    /**
     * Carga un archivo desde una URL al sistema de archivos de OpenCV.js
     * @param {string} path Nombre con el que se guardará en memoria (ej. 'classifier.xml')
     * @param {string} url Ruta del archivo XML
     * @param {function} onload Callback cuando se cargue el archivo
     * @param {function} onerror Callback en caso de error
     */
    createFileFromUrl(path, url, onload, onerror) {
        let request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';

        request.onload = () => {
            if (request.status === 200) {
                let data = new Uint8Array(request.response);
                cv.FS_createDataFile('/', path, data, true, false, false);
                this.printMessage(`Archivo cargado: ${path}`, 'success');
                if (onload) onload();
            } else {
                let errMsg = `Error al cargar archivo: ${url} (status ${request.status})`;
                this.printError(errMsg);
                if (onerror) onerror(errMsg);
            }
        };

        request.onerror = (e) => {
            let errMsg = `Error de red al intentar cargar: ${url}`;
            this.printError(errMsg);
            if (onerror) onerror(errMsg);
        };

        request.send();
    }

    /**
     * Actualiza la barra de progreso
     */
    updateProgress(percentage) {
        const progressBar = document.getElementById('loadingProgress');
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage);
        }
    }
}