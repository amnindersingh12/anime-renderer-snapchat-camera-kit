import React, { useRef, useState } from 'react';
import {
  bootstrapCameraKit,
  createVideoSource,
} from '@snap/camera-kit';
import './App.css';

const App: React.FC = () => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const processVideoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setDownloadUrl(null);

    try {
      // 1. Load Video Metadata first to get dimensions
      const inputVideo = document.createElement('video');
      inputVideo.muted = true;
      inputVideo.playsInline = true;
      inputVideo.src = URL.createObjectURL(file);

      await new Promise((resolve, reject) => {
        inputVideo.oncanplay = () => resolve(true);
        inputVideo.onerror = () => reject(new Error("Failed to load video"));
        setTimeout(() => reject(new Error("Video load timeout")), 15000);
      });

      // 2. Initialize Camera Kit
      const cameraKit = await bootstrapCameraKit({
        apiToken: import.meta.env.DEV
          ? import.meta.env.VITE_SNAP_STAGING_TOKEN
          : import.meta.env.VITE_SNAP_PROD_TOKEN,
      });

      // 3. Create Session with dimension capping (max 1280px)
      let width = inputVideo.videoWidth;
      let height = inputVideo.videoHeight;
      const MAX_DIM = 1280;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }
      width = width % 2 === 0 ? width : width - 1;
      height = height % 2 === 0 ? height : height - 1;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const session = await cameraKit.createSession({
        liveRenderTarget: canvas,
      });

      if (canvasContainerRef.current) {
        canvasContainerRef.current.replaceChildren(canvas);
      }

      // 4. Set Source and Apply Lens
      // Make video "visible" but tucked away to ensure the browser decodes it
      inputVideo.style.position = 'fixed';
      inputVideo.style.bottom = '0';
      inputVideo.style.right = '0';
      inputVideo.style.width = '160px';
      inputVideo.style.height = '90px';
      inputVideo.style.opacity = '0.01';
      inputVideo.style.zIndex = '9999';
      document.body.appendChild(inputVideo);

      await inputVideo.play();
      
      // Wait for a real frame to be ready - crucial for WebGL texture initialization
      if ('requestVideoFrameCallback' in inputVideo) {
        await new Promise((resolve) => (inputVideo as any).requestVideoFrameCallback(resolve));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const source = createVideoSource(inputVideo);
      await session.setSource(source);

      await cameraKit.lensRepository.loadLensGroups([import.meta.env.VITE_SNAP_LENS_GROUP_ID]);
      const lens = await cameraKit.lensRepository.loadLens(
        import.meta.env.VITE_SNAP_LENS_ID,
        import.meta.env.VITE_SNAP_LENS_GROUP_ID
      );
      
      if (!lens) throw new Error("Lens not found");
      await session.applyLens(lens);

      // Start the session loop BEFORE capturing the stream
      session.play();
      // Wait one frame for the first draw
      await new Promise(r => requestAnimationFrame(r));

      // 5. Setup Recording
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 5000000 
      });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(chunks, { type: 'video/webm' });
        setDownloadUrl(URL.createObjectURL(fullBlob));
        setIsProcessing(false);
        if (inputVideo.parentNode) {
          document.body.removeChild(inputVideo);
        }
        URL.revokeObjectURL(inputVideo.src);
      };

      // 6. Start Processing
      recorder.start();

      inputVideo.onended = () => {
        recorder.stop();
        session.pause();
      };

    } catch (error) {
      console.error("Renderer Error:", error);
      alert("Failed to process video. Check console for details.");
      // Cleanup if error happens before onstop
      const video = document.querySelector('video[src^="blob:"]');
      if (video && video.parentNode) {
        video.parentNode.removeChild(video);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>Anime Video Renderer</h1>
        <p>Convert your MP4 into Anime style</p>
      </header>

      <main className="main-content">
        <div className="upload-box">
          <input
            type="file"
            accept="video/*"
            onChange={processVideoFile}
            disabled={isProcessing}
            id="video-input"
            className="hidden-input"
          />
          <label htmlFor="video-input" className="upload-label">
            {isProcessing ? "Rendering Frames..." : "Upload MP4 Video"}
          </label>

          {downloadUrl && (
            <div className="result-actions">
              <a href={downloadUrl} download="anime_output.webm" className="download-link">
                ⬇️ Download Anime Video
              </a>
            </div>
          )}
        </div>

        <div ref={canvasContainerRef} className="preview-container" />
      </main>
    </div>
  );
};

export default App;