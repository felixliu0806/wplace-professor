import React from "react";

interface ImagePreviewProps {
  src: string;
  alt: string;
  className?: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ src, alt, className }) => {
  return (
    <div className="flex justify-center">
      <img 
        src={src} 
        alt={alt} 
        className={`max-h-80 max-w-full w-auto h-auto object-contain ${className || ""}`} 
      />
    </div>
  );
};

export default ImagePreview;