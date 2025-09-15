// Elementos del DOM
const videoElement = document.getElementById("videoInput");
const canvasOutput = document.getElementById("canvasOutput");
const blinkCountSpan = document.getElementById("blinkCount");
const smileCountSpan = document.getElementById("smileCount");
const browCountSpan = document.getElementById("browCount");

// Contadores de expresiones
let blinkCount = 0;
let smileCount = 0;
let browCount = 0;

// Clasificadores de cascada
let faceCascade, eyeCascade, smileCascade;

// Banderas de estado para la detección
let isBlinking = false;
let isSmiling = false;
let isBrowRaised = false;

// Variables para el control del cooldown y rendimiento
const FPS = 30;
let lastBlinkTime = 0;
let lastSmileTime = 0;
let lastBrowTime = 0;
const cooldownPeriod = 500; // 500ms para evitar conteo múltiple

/**
 * Carga un archivo XML de un haarcascade y lo guarda en el sistema de archivos virtual de OpenCV.
 * @param {string} url - La URL del archivo XML.
 * @returns {Promise<string>} - El nombre del archivo en el sistema de archivos virtual.
 */
async function loadCascade(url) {
    const fileName = url.split('/').pop();
    console.log(`Cargando ${fileName}...`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        cv.FS_createDataFile("/", fileName, new Uint8Array(buffer), true, false, false);
        console.log(`${fileName} cargado con éxito.`);
        return fileName;
    } catch (error) {
        console.error(`Error al cargar el archivo ${fileName}:`, error);
        return null;
    }
}

/**
 * Función principal que se llama cuando OpenCV.js está listo.
 */
async function onOpenCvReady() {
    console.log("✅ OpenCV.js v4.5.5 listo");

    // Paso 1: Cargar los archivos XML asincrónicamente
    const [faceXML, eyeXML, smileXML] = await Promise.all([
        loadCascade("assets/haarcascade_frontalface_default.xml"),
        loadCascade("assets/haarcascade_eye.xml"),
        loadCascade("assets/haarcascade_smile.xml")
    ]);

    // Paso 2: Verificar que todos los archivos se cargaron correctamente
    if (!faceXML || !eyeXML || !smileXML) {
        console.error("No se pudieron cargar todos los clasificadores. La aplicación no puede continuar.");
        return;
    }

    // Paso 3: Inicializar y cargar los clasificadores de OpenCV
    faceCascade = new cv.CascadeClassifier();
    eyeCascade = new cv.CascadeClassifier();
    smileCascade = new cv.CascadeClassifier();
    
    faceCascade.load(faceXML);
    eyeCascade.load(eyeXML);
    smileCascade.load(smileXML);

    // Paso 4: Una vez que todo está cargado e inicializado, iniciar la cámara
    startCameraAndProcess();
}

/**
 * Inicia la cámara y el bucle de procesamiento.
 */
async function startCameraAndProcess() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            canvasOutput.width = videoElement.videoWidth;
            canvasOutput.height = videoElement.videoHeight;
            processVideo();
        };
    } catch (err) {
        console.error("Error al acceder a la cámara:", err);
        alert("No se pudo acceder a la cámara. Por favor, asegúrate de dar permiso.");
    }
}

/**
 * Bucle principal de procesamiento de video.
 */
function processVideo() {
    const cap = new cv.VideoCapture(videoElement);
    const frame = new cv.Mat(videoElement.height, videoElement.width, cv.CV_8UC4);
    const gray = new cv.Mat();

    const process = () => {
        try {
            cap.read(frame);
            if (frame.empty()) {
                requestAnimationFrame(process);
                return;
            }

            cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY, 0);
            cv.equalizeHist(gray, gray);

            const faces = new cv.RectVector();
            faceCascade.detectMultiScale(gray, faces, 1.1, 3, 0, new cv.Size(30, 30));

            for (let i = 0; i < faces.size(); i++) {
                const face = faces.get(i);
                const roiGray = gray.roi(face);
                cv.rectangle(frame, face, [255, 0, 0, 255], 2);

                const eyes = new cv.RectVector();
                eyeCascade.detectMultiScale(roiGray, eyes, 1.1, 5, 0, new cv.Size(20, 20));
                
                if (eyes.size() === 0 && !isBlinking) {
                    isBlinking = true;
                } else if (eyes.size() > 0 && isBlinking) {
                    isBlinking = false;
                    if (Date.now() - lastBlinkTime > cooldownPeriod) {
                        blinkCount++;
                        blinkCountSpan.textContent = blinkCount;
                        lastBlinkTime = Date.now();
                    }
                }
                eyes.delete();

                const smiles = new cv.RectVector();
                smileCascade.detectMultiScale(roiGray, smiles, 1.8, 20, 0, new cv.Size(20, 20));
                
                if (smiles.size() > 0 && !isSmiling) {
                    isSmiling = true;
                    if (Date.now() - lastSmileTime > cooldownPeriod) {
                        smileCount++;
                        smileCountSpan.textContent = smileCount;
                        lastSmileTime = Date.now();
                    }
                } else if (smiles.size() === 0 && isSmiling) {
                    isSmiling = false;
                }
                smiles.delete();

                const browRegionHeight = face.height * 0.3;
                const browRegionY = face.y;
                const browROI = new cv.Rect(face.x, browRegionY, face.width, browRegionHeight);
                const browFrame = gray.roi(browROI);
                const meanValue = cv.mean(browFrame);
                
                const browThreshold = 150; 
                if (meanValue[0] > browThreshold && !isBrowRaised) {
                    isBrowRaised = true;
                    if (Date.now() - lastBrowTime > cooldownPeriod) {
                        browCount++;
                        browCountSpan.textContent = browCount;
                        lastBrowTime = Date.now();
                    }
                } else if (meanValue[0] <= browThreshold && isBrowRaised) {
                    isBrowRaised = false;
                }
                browFrame.delete();
                
                roiGray.delete();
            }

            faces.delete();
            cv.imshow(canvasOutput, frame);
            
        } catch (error) {
            console.error("Error en el bucle de procesamiento:", error);
        }

        requestAnimationFrame(process);
    };
    requestAnimationFrame(process);
}