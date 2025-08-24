import React from "react";
import { ColorInfo } from "../lib/palette";

interface PaletteColor {
  colorInfo: ColorInfo;
  isAvailable: boolean; // Auto-detected availability
  isSelected: boolean; // User selection
  count: number; // Pixel count for this color
}

interface ColorPaletteProps {
  colors: PaletteColor[];
  onColorToggle: (colorName: string) => void;
  onRefreshPalette: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  areAllSelected: boolean;
  // Remove totalCount property
}

// Simple SVG icons
const SelectIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

const DeselectIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <path d="M9 9l6 6m0-6l-6 6" />
  </svg>
);

const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 4v6h-6" />
    <path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

// Simple SVG star icon component for locked colors
const StarIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="gold"
    stroke="gold"
    strokeWidth="1"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="absolute top-0 right-0 transform translate-x-1 -translate-y-1"
    style={{
      width: '0.75rem',
      height: '0.75rem',
      position: 'absolute',
      top: 0,
      right: 0,
      transform: 'translate(25%, -25%)'
    }}
  >
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
  </svg>
);

const ColorPalette: React.FC<ColorPaletteProps> = ({ 
  colors, 
  onColorToggle, 
  onRefreshPalette,
  onSelectAll,
  onDeselectAll,
  areAllSelected
  // Remove totalCount from destructuring
}) => {
  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">Color Palette</h2>
        <div className="flex gap-2">
          <button 
            onClick={areAllSelected ? onDeselectAll : onSelectAll}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm transition-colors flex items-center"
            style={{ 
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {areAllSelected ? (
              <>
                <DeselectIcon className="w-4 h-4 mr-1" />
                None
              </>
            ) : (
              <>
                <SelectIcon className="w-4 h-4 mr-1" />
                All
              </>
            )}
          </button>
          <button 
            onClick={onRefreshPalette}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm transition-colors flex items-center"
            style={{ 
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <RefreshIcon className="w-4 h-4 mr-1" />
            Refresh
          </button>
        </div>
      </div>
      {/* Remove total pixel count display */}
      <div 
        className="p-2 bg-white rounded-lg border border-gray-300 w-full"
        style={{ 
          border: '1px solid #d1d5db',
          borderRadius: '0.5rem',
          padding: '0.5rem'
        }}
      >
        <div 
          className="flex flex-wrap gap-2"
          style={{ 
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
        >
          {colors.map((paletteColor) => (
            <div 
              key={paletteColor.colorInfo.colorName} 
              className="relative"
            >
              <div
                className={`w-8 h-8 rounded cursor-pointer border-2 flex items-center justify-center text-xs font-bold`}
                style={{ 
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '0.25rem',
                  border: paletteColor.isSelected ? '3px solid #1e40af' : '1px solid #d1d5db', // Use dark blue for selected, light gray for unselected
                  backgroundColor: paletteColor.colorInfo.rgbValue,
                  cursor: 'pointer',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white', // 默认白色文字
                  textShadow: '0 0 2px rgba(0,0,0,0.5)' // 文字阴影以提高可读性
                }}
                onClick={() => onColorToggle(paletteColor.colorInfo.colorName)}
              >
                {paletteColor.count > 0 ? paletteColor.count : ''}
              </div>
              {!paletteColor.isAvailable && (
                <div 
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 10,
                    opacity: 0.7 // Only apply opacity to the lock/star icon
                  }}
                >
                  <StarIcon />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ColorPalette;