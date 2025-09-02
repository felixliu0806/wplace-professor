import React, { useCallback, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PixelArtPreviewProps {
  pixelArtDataUrl: string | null;
  pixelScale: number;
  onScaleChange: (scale: number) => void;
  onFileSelect: (file: File) => void;
  onReupload?: () => void;
  onPlaceOverlay?: () => void;
}

const PixelArtPreview: React.FC<PixelArtPreviewProps> = ({ 
  pixelArtDataUrl, 
  pixelScale,
  onScaleChange,
  onFileSelect,
  onReupload,
  onPlaceOverlay
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  if (!pixelArtDataUrl) {
    return (
      <div className="mt-4 p-2 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Pixel Art Preview</h2>
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors w-full aspect-square flex items-center justify-center",
            isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById("fileInput")?.click()}
        >
          <input
            id="fileInput"
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileInput}
          />
          <p className="text-gray-600">
            {isDragging
              ? "Drop the image here ..."
              : "Drag & drop an image here, or click to select one"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-2 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-2">Pixel Art Preview</h2>
      
      {/* Pixel Scale Slider */}
      <div className="mb-4 p-2 bg-gray-50 rounded-lg">
        <div className="flex justify-between items-center mb-1">
          <label htmlFor="pixelScale" className="text-sm font-medium text-gray-700">
            Pixel Scale
          </label>
          <span className="text-sm font-medium text-gray-900 bg-white px-2 py-0.5 rounded border inline-flex items-center justify-center" style={{ minWidth: '30px', height: '24px' }}>{pixelScale}</span>
        </div>
        <Slider
          id="pixelScale"
          min={1}
          max={50}
          step={1}
          value={[pixelScale]}
          onValueChange={(value: number[]) => onScaleChange(value[0])}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-0.5">
          <span>Coarse</span>
          <span>Fine</span>
        </div>
      </div>
      
      <div className="flex justify-center mb-4">
        <img 
          src={pixelArtDataUrl} 
          alt="Pixel Art Preview" 
          className="max-h-80 max-w-full w-auto h-auto object-contain border rounded"
        />
      </div>
      
      {/* Action buttons */}
      <div className="flex justify-center gap-2">
        <Button 
          onClick={onReupload} 
          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
          variant="default"
          size="default"
        >
          Upload New Image
        </Button>
        
        {/* Place Overlay button */}
        {onPlaceOverlay && (
          <Button 
            onClick={onPlaceOverlay} 
            className="flex-1 bg-green-500 hover:bg-green-600 text-white"
            variant="default"
            size="default"
          >
            Place Overlay
          </Button>
        )}
      </div>
    </div>
  );
};

export default PixelArtPreview;