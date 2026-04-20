/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, Copy, ExternalLink, RefreshCw, AlertCircle, Image as ImageIcon, Upload } from 'lucide-react';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    stopCamera();
    setError(null);
    setResult(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true"); // required to tell iOS safari we don't want fullscreen
        videoRef.current.play();
        setIsScanning(true);
        requestRef.current = requestAnimationFrame(tick);
      }

      // Get list of cameras if not already fetched
      if (cameras.length === 0) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);
        
        // Find the active camera
        const activeTrack = stream.getVideoTracks()[0];
        const activeDevice = videoDevices.find(d => d.label === activeTrack.label);
        if (activeDevice) {
          setActiveCameraId(activeDevice.deviceId);
        }
      }

    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please ensure you have granted permission.");
    }
  }, [stopCamera, cameras.length]);

  const tick = useCallback(() => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          
          if (code) {
            setResult(code.data);
            // Optional: Draw a box around the QR code
            // drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#FF3B58");
            // drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#FF3B58");
            // drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#FF3B58");
            // drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#FF3B58");
          }
        }
      }
    }
    
    // Continue scanning if no result
    if (!result) {
      requestRef.current = requestAnimationFrame(tick);
    } else {
      // Stop scanning once we have a result
      stopCamera();
    }
  }, [result, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const handleSwitchCamera = () => {
    if (cameras.length > 1) {
      const currentIndex = cameras.findIndex(c => c.deviceId === activeCameraId);
      const nextIndex = (currentIndex + 1) % cameras.length;
      const nextCamera = cameras[nextIndex];
      setActiveCameraId(nextCamera.deviceId);
      startCamera(nextCamera.deviceId);
    }
  };

  const handleRescan = () => {
    setResult(null);
    startCamera(activeCameraId || undefined);
  };

  const processImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Scale down to avoid massive processing pauses
        const maxDim = 1000;
        if (width > maxDim || height > maxDim) {
           const ratio = Math.min(maxDim / width, maxDim / height);
           width *= ratio;
           height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert"
        });

        if (code) {
           stopCamera();
           setResult(code.data);
           setError(null);
        } else {
           setError("No QR code found in the uploaded image.");
           setResult(null);
           stopCamera();
        }
      };
      if (typeof event.target?.result === 'string') {
        img.src = event.target.result;
      }
    };
    reader.readAsDataURL(file);
  }, [stopCamera]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
    e.target.value = ''; // Reset input
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const relatedTarget = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file);
    } else if (file) {
      setError("Please drop a valid image file.");
      setResult(null);
      stopCamera();
    }
  }, [processImageFile, stopCamera]);

  const [copied, setCopied] = useState(false);
  const copyToClipboard = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isUrl = result && (result.startsWith('http://') || result.startsWith('https://'));

  return (
    <div 
      className="min-h-screen bg-zinc-50 flex flex-col items-center py-8 px-4 font-sans relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden relative transition-all duration-200 border ${isDragging ? 'border-green-500 ring-4 ring-green-500/20' : 'border-zinc-100'}`}>
        
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center">
            <Upload className="w-16 h-16 text-green-500 mb-4 animate-bounce" />
            <h2 className="text-xl font-bold text-green-600">Drop QR Code Image Here</h2>
          </div>
        )}
        
        {/* Header */}
        <div className="bg-zinc-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Camera className="w-6 h-6 text-zinc-300" />
            <h1 className="text-xl font-semibold tracking-tight">QR Scanner</h1>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
              title="Upload Image"
            >
              <ImageIcon className="w-5 h-5 text-zinc-300" />
            </button>
            {cameras.length > 1 && (
              <button 
                onClick={handleSwitchCamera}
                className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
                title="Switch Camera"
              >
                <RefreshCw className="w-5 h-5 text-zinc-300" />
              </button>
            )}
          </div>
        </div>

        {/* Scanner Area */}
        <div className="relative bg-black aspect-[4/3] flex items-center justify-center overflow-hidden">
          {error ? (
            <div className="text-center p-6 flex flex-col items-center gap-3">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-red-400 text-sm font-medium">{error}</p>
              <button 
                onClick={() => startCamera()}
                className="mt-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <video 
                ref={videoRef} 
                className={`w-full h-full object-cover ${result ? 'opacity-50 blur-sm' : 'opacity-100'} transition-all duration-300`}
              />
              <canvas ref={canvasRef} className="hidden" />
              
              {/* Scanner Overlay (Target Box) */}
              {!result && isScanning && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 border-[40px] border-black/40"></div>
                  <div className="absolute inset-[40px] border-2 border-white/50 rounded-lg">
                    {/* Corner accents */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg -mt-0.5 -ml-0.5"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg -mt-0.5 -mr-0.5"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg -mb-0.5 -ml-0.5"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg -mb-0.5 -mr-0.5"></div>
                    
                    {/* Scanning line animation */}
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-green-500 shadow-[0_0_8px_2px_rgba(34,197,94,0.5)] animate-scan"></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Result Area */}
        <div className="p-6">
          {result ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-green-800 mb-2">Scanned Result</h3>
                <p className="text-zinc-800 font-mono text-sm break-all">{result}</p>
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={copyToClipboard}
                  className="flex-1 flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 py-3 px-4 rounded-xl font-medium transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                
                {isUrl && (
                  <a 
                    href={result}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Link
                  </a>
                )}
              </div>
              
              <button 
                onClick={handleRescan}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white py-3 px-4 rounded-xl font-medium transition-colors"
              >
                Scan Another Code
              </button>
            </div>
          ) : (
            <div className="text-center py-8 flex flex-col items-center justify-center gap-4">
              <div>
                <p className="text-zinc-500 font-medium">Point your camera at a QR code</p>
                <p className="text-zinc-400 text-sm mt-1">or drop an image anywhere</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 py-2 px-4 rounded-xl font-medium transition-colors text-sm"
              >
                <ImageIcon className="w-4 h-4" />
                Upload Image
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
