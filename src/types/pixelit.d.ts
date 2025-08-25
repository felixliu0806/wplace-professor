// Type definitions for pixelit.min.js
// This is a simplified declaration based on typical usage

declare class Pixelit {
  constructor(config: {
    to?: string | HTMLCanvasElement; // Selector string or canvas element for output
    from?: string | HTMLImageElement; // Selector string or image element for input
    scale?: number;
    palette?: string[]; // Array of RGB strings like "rgb(255, 0, 0)"
    maxHeight?: number;
    maxWidth?: number;
  });

  /**
   * Send the image to the canvas
   */
  sendImageToCanvas(): Pixelit;

  /**
   * Convert image to pixel art
   */
  pixelate(): Pixelit;

  /**
   * Apply the palette to the pixel art
   */
  convertPalette(): Pixelit;

  /**
   * Draw the pixel art to the output canvas
   */
  draw(): Pixelit;

  /**
   * Get the color count map
   * @returns Map<colorString, count>
   */
  getColorCount(): Map<string, number>;

  /**
   * Get the output canvas element
   */
  getCanvas(): HTMLCanvasElement;

  /**
   * Get the color count map
   * @returns Map<colorString, count>
   */
  getColorCount(): Map<string, number>;
}

export default Pixelit;