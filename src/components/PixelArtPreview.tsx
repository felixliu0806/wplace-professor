import React from "react";

interface PixelArtPreviewProps {
  pixelArtDataUrl: string | null;
  colorCounts: Map<string, number>;
  getColorName: (rgbValue: string) => string;
}

const PixelArtPreview: React.FC<PixelArtPreviewProps> = ({ 
  pixelArtDataUrl, 
  colorCounts,
  getColorName
}) => {
  if (!pixelArtDataUrl) {
    return (
      <div className="mt-4 p-2 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Pixel Art Preview</h2>
        <p className="text-gray-500">No pixel art generated yet.</p>
      </div>
    );
  }

  // Convert Map to array for rendering
  const colorCountArray = Array.from(colorCounts.entries());

  return (
    <div className="mt-4 p-2 bg-white rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-2">Pixel Art Preview</h2>
      <div className="flex justify-center mb-4">
        <img 
          src={pixelArtDataUrl} 
          alt="Pixel Art Preview" 
          className="max-h-40 w-auto object-contain"
        />
      </div>
      
      <h3 className="text-md font-medium mb-1">Color Usage:</h3>
      <div className="flex flex-wrap gap-2">
        {colorCountArray.map(([colorRgb, count]) => {
          // Only show colors that were used
          if (count === 0) return null;
          
          return (
            <div key={colorRgb} className="flex items-center gap-1">
              <div 
                className="w-4 h-4 rounded-sm border border-gray-300" 
                style={{ backgroundColor: colorRgb }}
              />
              <span className="text-xs">{getColorName(colorRgb)}: {count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PixelArtPreview;