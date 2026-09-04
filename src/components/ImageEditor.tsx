import React, { useState, useCallback, useRef, useEffect } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { X, Check, RotateCcw, Sliders, Crop as CropIcon, Maximize2, Sun, Contrast, Droplets, Zap, Undo2, Redo2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ImageEditorProps {
  imageUrl: string;
  onSave: (editedImageUrl: string) => void;
  onCancel: () => void;
}

interface Filters {
  brightness: number;
  contrast: number;
  saturate: number;
  grayscale: number;
  sepia: number;
  hueRotate: number;
  blur: number;
}

const DEFAULT_FILTERS: Filters = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
  hueRotate: 0,
  blur: 0,
};

interface EditorState {
  crop: Point;
  zoom: number;
  rotation: number;
  filters: Filters;
}

export default function ImageEditor({ imageUrl, onSave, onCancel }: ImageEditorProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [activeTab, setActiveTab] = useState<'crop' | 'filters'>('crop');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [isProcessing, setIsProcessing] = useState(false);

  // History State
  const [historyState, setHistoryState] = useState<{
    history: EditorState[];
    index: number;
  }>({
    history: [{
      crop: { x: 0, y: 0 },
      zoom: 1,
      rotation: 0,
      filters: DEFAULT_FILTERS
    }],
    index: 0
  });

  const isInternalUpdate = useRef(false);
  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pushToHistory = useCallback((newState: EditorState) => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current);

    historyTimeoutRef.current = setTimeout(() => {
      setHistoryState(prev => {
        const newHistory = prev.history.slice(0, prev.index + 1);
        const lastState = newHistory[newHistory.length - 1];
        if (JSON.stringify(lastState) === JSON.stringify(newState)) return prev;
        
        const updatedHistory = [...newHistory, newState].slice(-20);
        return {
          history: updatedHistory,
          index: updatedHistory.length - 1
        };
      });
    }, 500);
  }, []);

  useEffect(() => {
    pushToHistory({ crop, zoom, rotation, filters });
  }, [crop, zoom, rotation, filters, pushToHistory]);

  const undo = () => {
    if (historyState.index > 0) {
      const prevIndex = historyState.index - 1;
      const prevState = historyState.history[prevIndex];
      isInternalUpdate.current = true;
      setCrop(prevState.crop);
      setZoom(prevState.zoom);
      setRotation(prevState.rotation);
      setFilters(prevState.filters);
      setHistoryState(prev => ({ ...prev, index: prevIndex }));
    }
  };

  const redo = () => {
    if (historyState.index < historyState.history.length - 1) {
      const nextIndex = historyState.index + 1;
      const nextState = historyState.history[nextIndex];
      isInternalUpdate.current = true;
      setCrop(nextState.crop);
      setZoom(nextState.zoom);
      setRotation(nextState.rotation);
      setFilters(nextState.filters);
      setHistoryState(prev => ({ ...prev, index: nextIndex }));
    }
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    rotation: number = 0,
    filters: Filters
  ): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return '';

    const rotRad = (rotation * Math.PI) / 180;
    const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
      image.width,
      image.height,
      rotation
    );

    // Set canvas size to match the bounding box
    canvas.width = bBoxWidth;
    canvas.height = bBoxHeight;

    // Translate and rotate
    ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
    ctx.rotate(rotRad);
    ctx.translate(-image.width / 2, -image.height / 2);

    // Apply filters to the context
    ctx.filter = `
      brightness(${filters.brightness}%) 
      contrast(${filters.contrast}%) 
      saturate(${filters.saturate}%) 
      grayscale(${filters.grayscale}%) 
      sepia(${filters.sepia}%) 
      hue-rotate(${filters.hueRotate}deg)
      blur(${filters.blur}px)
    `;

    // Draw the image
    ctx.drawImage(image, 0, 0);

    // Extract the cropped area
    const data = ctx.getImageData(
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height
    );

    // Resize canvas to the cropped area
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    // Put the cropped image back
    ctx.putImageData(data, 0, 0);

    return canvas.toDataURL('image/png');
  };

  const rotateSize = (width: number, height: number, rotation: number) => {
    const rotRad = (rotation * Math.PI) / 180;
    return {
      width:
        Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
      height:
        Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
    };
  };

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const editedUrl = await getCroppedImg(imageUrl, croppedAreaPixels, rotation, filters);
      onSave(editedUrl);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspect(1);
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 bg-black/90 z-[100] flex flex-col transition-all duration-700",
        activeTab === 'crop' ? "backdrop-blur-md" : "backdrop-blur-[40px]"
      )}
    >
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="p-2 text-white/60 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
          <h2 className="text-white font-semibold">Edit Image</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={historyState.index === 0}
            className="p-2 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
            title="Undo"
          >
            <Undo2 size={20} />
          </button>
          <button
            onClick={redo}
            disabled={historyState.index === historyState.history.length - 1}
            className="p-2 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
            title="Redo"
          >
            <Redo2 size={20} />
          </button>
          <div className="w-px h-6 bg-white/10 mx-2" />
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={isProcessing}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white rounded-full font-semibold transition-all shadow-lg shadow-indigo-500/20"
          >
            {isProcessing ? (
              <Zap className="w-4 h-4 animate-pulse" />
            ) : (
              <Check size={18} />
            )}
            {isProcessing ? 'Processing...' : 'Save Changes'}
          </button>
        </div>
      </header>

      {/* Main Editor Area */}
      <main className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
        <div className="flex-1 relative bg-black/40">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
            style={{
              containerStyle: {
                filter: `
                  brightness(${filters.brightness}%) 
                  contrast(${filters.contrast}%) 
                  saturate(${filters.saturate}%) 
                  grayscale(${filters.grayscale}%) 
                  sepia(${filters.sepia}%) 
                  hue-rotate(${filters.hueRotate}deg)
                  blur(${filters.blur}px)
                `,
              },
            }}
          />
          
          {/* Floating Zoom Control */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-xl px-6 py-3 rounded-2xl border border-white/10 shadow-2xl z-10 group transition-all hover:bg-black/80">
            <button 
              onClick={() => setZoom(Math.max(1, zoom - 0.1))}
              className="text-white/60 hover:text-white transition-colors"
            >
              <Maximize2 size={16} className="rotate-45" />
            </button>
            <div className="w-32 md:w-48 flex flex-col gap-1">
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
                <span>1x</span>
                <span className="text-indigo-400">{zoom.toFixed(1)}x</span>
                <span>3x</span>
              </div>
            </div>
            <button 
              onClick={() => setZoom(Math.min(3, zoom + 0.1))}
              className="text-white/60 hover:text-white transition-colors"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>

        {/* Controls Sidebar */}
        <aside className="w-full md:w-80 bg-white/5 border-l border-white/10 flex flex-col">
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('crop')}
              className={cn(
                "flex-1 py-4 text-sm font-medium transition-all flex items-center justify-center gap-2",
                activeTab === 'crop' ? "text-indigo-400 border-b-2 border-indigo-400" : "text-white/40 hover:text-white/60"
              )}
            >
              <CropIcon size={16} />
              Crop & Rotate
            </button>
            <button
              onClick={() => setActiveTab('filters')}
              className={cn(
                "flex-1 py-4 text-sm font-medium transition-all flex items-center justify-center gap-2",
                activeTab === 'filters' ? "text-indigo-400 border-b-2 border-indigo-400" : "text-white/40 hover:text-white/60"
              )}
            >
              <Sliders size={16} />
              Filters
            </button>
          </div>

          <div className="p-6 space-y-8 overflow-y-auto">
            {activeTab === 'crop' ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold text-white/40 uppercase tracking-wider">
                    <span>Aspect Ratio</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Free', value: undefined },
                      { label: '1:1', value: 1 },
                      { label: '4:3', value: 4 / 3 },
                      { label: '16:9', value: 16 / 9 },
                      { label: '3:2', value: 3 / 2 },
                      { label: '9:16', value: 9 / 16 },
                    ].map((ratio) => (
                      <button
                        key={ratio.label}
                        onClick={() => setAspect(ratio.value)}
                        className={cn(
                          "py-2 text-[10px] font-bold rounded-lg border transition-all",
                          aspect === ratio.value 
                            ? "bg-indigo-600 border-indigo-600 text-white" 
                            : "bg-white/5 border-white/10 text-white/60 hover:border-white/20 hover:text-white"
                        )}
                      >
                        {ratio.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold text-white/40 uppercase tracking-wider">
                    <span>Rotation</span>
                    <span>{rotation}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {[
                  { label: 'Brightness', key: 'brightness', icon: <Sun size={14} />, min: 0, max: 200 },
                  { label: 'Contrast', key: 'contrast', icon: <Contrast size={14} />, min: 0, max: 200 },
                  { label: 'Saturation', key: 'saturate', icon: <Droplets size={14} />, min: 0, max: 200 },
                  { label: 'Grayscale', key: 'grayscale', icon: <Maximize2 size={14} />, min: 0, max: 100 },
                  { label: 'Sepia', key: 'sepia', icon: <Maximize2 size={14} />, min: 0, max: 100 },
                  { label: 'Blur', key: 'blur', icon: <Droplets size={14} />, min: 0, max: 20 },
                  { label: 'Hue Rotate', key: 'hueRotate', icon: <RotateCcw size={14} />, min: 0, max: 360 },
                ].map((f) => (
                  <div key={f.key} className="space-y-3">
                    <div className="flex justify-between text-xs font-bold text-white/40 uppercase tracking-wider items-center">
                      <div className="flex items-center gap-2">
                        {f.icon}
                        {f.label}
                      </div>
                      <span>{filters[f.key as keyof Filters]}{f.key === 'hueRotate' ? '°' : f.key === 'blur' ? 'px' : '%'}</span>
                    </div>
                    <input
                      type="range"
                      min={f.min}
                      max={f.max}
                      step={1}
                      value={filters[f.key as keyof Filters]}
                      onChange={(e) => setFilters(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </motion.div>
  );
}
