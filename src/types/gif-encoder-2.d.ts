declare module 'gif-encoder-2' {
  interface GIFEncoderOut {
    getData(): Buffer;
  }
  
  class GIFEncoder {
    out: GIFEncoderOut;
    
    constructor(width: number, height: number);
    setDelay(delay: number): void;
    setRepeat(repeat: number): void;
    setTransparent(color: number | null): void;
    start(): void;
    addFrame(imageData: Buffer | Uint8Array | Uint8ClampedArray): void;
    finish(): void;
  }
  
  export = GIFEncoder;
}