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

// Estados de detección
let eyesDetected = false;
let lastEyeStateChange = Date.now();

let smileDetected = false;
let lastSmileStateChange = Date.now();

let lastEyebrowMean = null;
let eyebrowMovementDetected = false;

const TOLERANCE_TIME = 300; // ms para tolerancia de parpadeo y sonrisa

// Función global para saber cuando OpenCV está listo
function onOpenCvReady() {
    console.log("OpenCV.js está listo");
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

    // Cargar clasificadores Haar
    utils.createFileFromUrl('haarcascade_frontalface_default.xml',
        'classifiers/haarcascade_frontalface_default.xml', () => {
            faceCascade.load('haarcascade_frontalface_default.xml');
            console.log("✅ Haarcascade rostro cargado");
            utils.updateProgress(60);

            utils.createFileFromUrl('haarcascade_eye.xml',
                'classifiers/haarcascade_eye.xml', () => {
                    eyeCascade.load('haarcascade_eye.xml');
                    console.log("✅ Haarcascade ojos cargado");
                    utils.updateProgress(80);

                    utils.createFileFromUrl('haarcascade_smile.xml',
                        'classifiers/haarcascade_smile.xml', () => {
                            smileCascade.load('haarcascade_smile.xml');
                            console.log("✅ Haarcascade sonrisa cargado");
                            utils.updateProgress(100);
                            utils.printMessage('Sistema listo. Haz clic en Iniciar para comenzar.', 'success');
                        });
                });
        });

    // Asignar eventos
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

            setTimeout(() => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
                gray = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC1);

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
    if (detectionInterval) cancelAnimationFrame(detectionInterval);

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
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        src.data.set(imageData.data);

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.equalizeHist(gray, gray);

        let faces = new cv.RectVector();
        faceCascade.detectMultiScale(gray, faces, 1.1, 3, 0);

        ctx.strokeStyle = '#0d6efd';
        ctx.lineWidth = 2;

        for (let i = 0; i < faces.size(); i++) {
            let face = faces.get(i);
            ctx.strokeRect(face.x, face.y, face.width, face.height);

            let faceROI = gray.roi(face);

            // --- OJOS (Parpadeo) ---
            let eyes = new cv.RectVector();
            eyeCascade.detectMultiScale(faceROI, eyes, 1.1, 2, 0);
            let eyesNow = eyes.size() >= 2;

            if (eyesNow !== eyesDetected) {
                let now = Date.now();
                if (!eyesNow && eyesDetected) {
                    lastEyeStateChange = now; // desaparecieron
                } else if (eyesNow && !eyesDetected && (now - lastEyeStateChange) < TOLERANCE_TIME) {
                    blinkCounter++;
                    document.getElementById("blinkCounter").innerText = blinkCounter;
                    highlightCounter("blinkCounter");
                }
                eyesDetected = eyesNow;
            }

            for (let j = 0; j < eyes.size(); j++) {
                let e = eyes.get(j);
                ctx.strokeStyle = "#ffc107";
                ctx.strokeRect(face.x + e.x, face.y + e.y, e.width, e.height);
            }
            eyes.delete();

            // --- SONRISA ---
            let smiles = new cv.RectVector();
            smileCascade.detectMultiScale(faceROI, smiles, 1.5, 20, 0);
            let smileNow = smiles.size() > 0;

            if (smileNow !== smileDetected) {
                let now = Date.now();
                if (!smileNow && smileDetected) {
                    lastSmileStateChange = now; // desapareció
                } else if (smileNow && !smileDetected && (now - lastSmileStateChange) < TOLERANCE_TIME) {
                    smileCounter++;
                    document.getElementById("smileCounter").innerText = smileCounter;
                    highlightCounter("smileCounter");
                }
                smileDetected = smileNow;
            }

            for (let j = 0; j < smiles.size(); j++) {
                let s = smiles.get(j);
                ctx.strokeStyle = "#198754";
                ctx.strokeRect(face.x + s.x, face.y + s.y, s.width, s.height);
            }
            smiles.delete();

            // --- CEJAS ---
            let eyebrowRegion = faceROI.roi(new cv.Rect(0, 0, faceROI.cols, Math.floor(faceROI.rows / 3)));
            let mean = cv.mean(eyebrowRegion)[0];

            if (lastEyebrowMean !== null && Math.abs(mean - lastEyebrowMean) > 20 && !eyebrowMovementDetected) {
                eyebrowCounter++;
                document.getElementById("eyebrowCounter").innerText = eyebrowCounter;
                highlightCounter("eyebrowCounter");
                eyebrowMovementDetected = true;
                setTimeout(() => (eyebrowMovementDetected = false), 500);
            }
            lastEyebrowMean = mean;

            eyebrowRegion.delete();
            faceROI.delete();
        }

        faces.delete();
        detectionInterval = requestAnimationFrame(detect);
    } catch (err) {
        console.error("Error en detección:", err);
        utils.printError('Error en detección: ' + err.message);
        stopCamera();
    }
}

// Resaltar contador
function highlightCounter(counterId) {
    const counter = document.getElementById(counterId);
    counter.classList.add("highlight");
    setTimeout(() => counter.classList.remove("highlight"), 500);
}

// Estilos highlight
const style = document.createElement("style");
style.textContent = `
    .highlight {
        color: #dc3545 !important;
        font-size: 2rem !important;
        transition: all 0.3s ease;
    }
`;
document.head.appendChild(style);
