// Variables globales
let video = document.getElementById("video");
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
let overlayText = document.getElementById("overlayText");

let blinkCounter = 0;
let smileCounter = 0;
let eyebrowCounter = 0;

let streaming = false;
let src, gray;
let faceCascade, eyeCascade, smileCascade;
let utils;
let openCvReady = false;
let detectionInterval;

// Función global para saber cuando OpenCV está listo
function onOpenCvReady() {
    console.log("OpenCV.js está listo");
    // Esperamos a que OpenCV esté completamente inicializado
    cv['onRuntimeInitialized'] = () => {
        openCvReady = true;
        initializeOpenCv();
    };
}

// Inicialización de OpenCV
function initializeOpenCv() {
    if (typeof cv === 'undefined' || !openCvReady) {
        setTimeout(initializeOpenCv, 50);
        return;
    }

    utils = new Utils('statusMessage');
    utils.printMessage('OpenCV.js cargado correctamente', 'success');
    utils.updateProgress(30);

    // Crear clasificadores
    faceCascade = new cv.CascadeClassifier();
    eyeCascade = new cv.CascadeClassifier();
    smileCascade = new cv.CascadeClassifier();

    // Cargar XML
    utils.createFileFromUrl('haarcascade_frontalface_default.xml',
        'classifiers/haarcascade_frontalface_default.xml', () => {
            faceCascade.load('haarcascade_frontalface_default.xml');
            console.log("✅ Haarcascade rostro cargado");
            utils.updateProgress(60);
            
            // Cargar siguiente clasificador
            utils.createFileFromUrl('haarcascade_eye.xml',
                'classifiers/haarcascade_eye.xml', () => {
                    eyeCascade.load('haarcascade_eye.xml');
                    console.log("✅ Haarcascade ojos cargado");
                    utils.updateProgress(80);
                    
                    // Cargar último clasificador
                    utils.createFileFromUrl('haarcascade_smile.xml',
                        'classifiers/haarcascade_smile.xml', () => {
                            smileCascade.load('haarcascade_smile.xml');
                            console.log("✅ Haarcascade sonrisa cargado");
                            utils.updateProgress(100);
                            utils.printMessage('Sistema listo. Haz clic en Iniciar para comenzar.', 'success');
                        });
                });
        });

    // Asignar eventos a botones
    document.getElementById("startBtn").addEventListener("click", startCamera);
    document.getElementById("stopBtn").addEventListener("click", stopCamera);
    document.getElementById("resetBtn").addEventListener("click", resetCounters);
}

// Iniciar cámara
function startCamera() {
    if (!openCvReady) {
        utils.printError('OpenCV no está listo todavía');
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(function (stream) {
            video.srcObject = stream;
            video.play();
            streaming = true;
            overlayText.style.display = 'none';
            
            document.getElementById("startBtn").disabled = true;
            document.getElementById("stopBtn").disabled = false;

            // Ajustar el tamaño del canvas al del video
            setTimeout(() => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
                gray = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC1);

                // Iniciar detección
                detectionInterval = requestAnimationFrame(detect);
            }, 500);
        })
        .catch(function (err) {
            console.error("❌ Error al acceder a la cámara: " + err);
            utils.printError('Error al acceder a la cámara: ' + err.message);
        });
}

// Detener cámara
function stopCamera() {
    if (detectionInterval) {
        cancelAnimationFrame(detectionInterval);
    }
    
    let stream = video.srcObject;
    if (stream) {
        let tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    streaming = false;
    overlayText.style.display = 'block';
    overlayText.textContent = 'Cámara desactivada';
    
    document.getElementById("startBtn").disabled = false;
    document.getElementById("stopBtn").disabled = true;

    // Liberar memoria de OpenCV
    if (src) src.delete();
    if (gray) gray.delete();
}

// Reiniciar contadores
function resetCounters() {
    blinkCounter = 0;
    smileCounter = 0;
    eyebrowCounter = 0;
    document.getElementById("blinkCounter").innerText = blinkCounter;
    document.getElementById("smileCounter").innerText = smileCounter;
    document.getElementById("eyebrowCounter").innerText = eyebrowCounter;
    utils.printMessage('Contadores reiniciados', 'info');
}

// Detección en tiempo real
function detect() {
    if (!streaming) return;

    try {
        // Dibujar el frame actual en el canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Obtener los datos de la imagen
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        src.data.set(imageData.data);
        
        // Convertir a escala de grises
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        
        // Ecualizar el histograma para mejorar el contraste
        cv.equalizeHist(gray, gray);
        
        let faces = new cv.RectVector();
        let eyes = new cv.RectVector();
        let smiles = new cv.RectVector();

        // Detectar rostros
        faceCascade.detectMultiScale(gray, faces, 1.1, 3, 0);

        // Dibujar rectángulos alrededor de los rostros detectados
        ctx.strokeStyle = '#0d6efd';
        ctx.lineWidth = 2;
        
        for (let i = 0; i < faces.size(); i++) {
            let face = faces.get(i);
            
            // Dibujar rectángulo alrededor del rostro
            ctx.beginPath();
            ctx.rect(face.x, face.y, face.width, face.height);
            ctx.stroke();
            
            let faceROI = gray.roi(face);

            // Detección de ojos (parpadeo)
            eyeCascade.detectMultiScale(faceROI, eyes, 1.1, 2, 0);
            
            // Dibujar ojos y contar parpadeos
            ctx.strokeStyle = '#ffc107';
            let eyesVisible = 0;
            
            for (let j = 0; j < eyes.size(); j++) {
                let eye = eyes.get(j);
                ctx.beginPath();
                ctx.rect(face.x + eye.x, face.y + eye.y, eye.width, eye.height);
                ctx.stroke();
                eyesVisible++;
            }
            
            // Si se detectan menos de 2 ojos, incrementar contador de parpadeos
            if (eyes.size() < 2 && eyes.size() > 0) {
                blinkCounter++;
                document.getElementById("blinkCounter").innerText = blinkCounter;
                
                // Destacar el contador
                highlightCounter('blinkCounter');
            }

            // Detección de sonrisa
            smileCascade.detectMultiScale(faceROI, smiles, 1.5, 20, 0);
            
            // Dibujar sonrisas y contar
            ctx.strokeStyle = '#198754';
            for (let j = 0; j < smiles.size(); j++) {
                let smile = smiles.get(j);
                ctx.beginPath();
                ctx.rect(face.x + smile.x, face.y + smile.y, smile.width, smile.height);
                ctx.stroke();
            }
            
            if (smiles.size() > 0) {
                smileCounter++;
                document.getElementById("smileCounter").innerText = smileCounter;
                
                // Destacar el contador
                highlightCounter('smileCounter');
            }

            // Detección de cejas (basado en la región superior del rostro)
            let eyebrowRegion = faceROI.roi(new cv.Rect(0, 0, faceROI.cols, Math.floor(faceROI.rows / 3)));
            let mean = cv.mean(eyebrowRegion);
            
            // Si la intensidad media es alta (posible movimiento de cejas)
            if (mean[0] > 70) {
                eyebrowCounter++;
                document.getElementById("eyebrowCounter").innerText = eyebrowCounter;
                
                // Destacar el contador
                highlightCounter('eyebrowCounter');
            }
            
            eyebrowRegion.delete();
            faceROI.delete();
        }

        faces.delete();
        eyes.delete();
        smiles.delete();
        
        // Continuar con el siguiente frame
        detectionInterval = requestAnimationFrame(detect);
    } catch (err) {
        console.error("Error en detección:", err);
        utils.printError('Error en el proceso de detección: ' + err.message);
        stopCamera();
    }
}

// Función para destacar visualmente un contador cuando cambia
function highlightCounter(counterId) {
    const counter = document.getElementById(counterId);
    counter.classList.add('highlight');
    
    setTimeout(() => {
        counter.classList.remove('highlight');
    }, 500);
}

// Añadir estilos para el highlight
const style = document.createElement('style');
style.textContent = `
    .highlight {
        color: #dc3545 !important;
        font-size: 2rem !important;
        transition: all 0.3s ease;
    }
`;
document.head.appendChild(style);