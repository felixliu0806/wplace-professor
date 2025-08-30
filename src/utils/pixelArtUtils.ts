// Function to get pixel data from the converted pixel art canvas
export const getPixelArtData = (canvas: HTMLCanvasElement): {x: number, y: number, color: string}[] => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  const pixels: {x: number, y: number, color: string}[] = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      // Skip transparent pixels
      if (a === 0) continue;
      
      const color = `rgb(${r},${g},${b})`;
      pixels.push({x, y, color});
    }
  }
  
  return pixels;
};